import Anthropic from "@anthropic-ai/sdk";
import { queryDataSource, updatePage, prop, readTitle, readText, readUrl } from "./notion";
import { tokensToJpy } from "./cost";

type EnrichOutput = {
  persona: "A_Developer" | "B_SaaS_CTO" | "C_AccountingDX" | "D_CFO_Founder";
  score: number;
  tier: "Tier1" | "Tier2" | "Tier3";
  score_reason: string;
  signals: Array<
    "posted_about_agents" | "hiring_ai" | "uses_freee" | "attended_event" | "liked_our_post"
  >;
  recent_post_summary: string;
};

const SYSTEM = `あなたはLemonCake (lemoncake.xyz) のリードスコアリングエージェントです。
LemonCakeはAIエージェント向けM2M決済インフラ（Pay Token / JPYC / freee自動仕訳 / Evidence Hash）を提供します。

ペルソナ定義：
- A_Developer: Dify/LangChain/MCP等を触る個人開発者・エンジニア
- B_SaaS_CTO: SaaS企業のCTO/VPoE。AI機能をプロダクトに組み込もうとしている層
- C_AccountingDX: freee/MoneyForwardユーザー、会計DX関心、税理士・経理畑
- D_CFO_Founder: スタートアップCFO/創業者、API支出の可視化に関心

スコアリング基準（0-100）：
- 90+: Tier1。AIエージェント自作中 or 採用ポジション中 or 当社投稿に明確なエンゲージ
- 70-89: Tier2。テーマ周辺で発信あり、まだ温度感は中程度
- 0-69: Tier3。業界違い or 接点が薄い

JSON以外のテキストは絶対に出力しないこと。Markdownコードフェンスも禁止。`;

const userTemplate = (name: string, company: string, title: string, rawInput: string, url: string | null) =>
  `LinkedInプロフィール情報を以下に貼ります。スコアリングしてJSONで返してください。

# 基本情報
name: ${name}
company: ${company}
title: ${title}
linkedin_url: ${url ?? ""}

# raw_input (本人プロフィール+直近投稿)
${rawInput}

# 出力フォーマット
{
  "persona": "A_Developer" | "B_SaaS_CTO" | "C_AccountingDX" | "D_CFO_Founder",
  "score": 0-100の整数,
  "tier": "Tier1" | "Tier2" | "Tier3",
  "score_reason": "50字以内、なぜそのスコアか",
  "signals": ["posted_about_agents", "hiring_ai", "uses_freee", "attended_event", "liked_our_post"のうち該当するもの],
  "recent_post_summary": "直近投稿3行要約（改行区切り）"
}`;

function tierFromScore(score: number): "Tier1" | "Tier2" | "Tier3" {
  if (score >= 90) return "Tier1";
  if (score >= 70) return "Tier2";
  return "Tier3";
}

export async function runEnrich(client: Anthropic, model: string, dryRun: boolean) {
  const leadsDsId = process.env.NOTION_LEADS_DS_ID!;
  const leads = await queryDataSource(leadsDsId, {
    and: [
      { property: "status", select: { equals: "new" } },
      { property: "raw_input", rich_text: { is_not_empty: true } },
    ],
  });

  console.log(`[enrich] ${leads.length} new leads with raw_input`);
  let total = 0;

  for (const lead of leads) {
    const name = readTitle(lead, "name");
    const company = readText(lead, "company");
    const title = readText(lead, "title");
    const rawInput = readText(lead, "raw_input");
    const url = readUrl(lead, "linkedin_url");

    const msg = await client.messages.create({
      model,
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userTemplate(name, company, title, rawInput, url) }],
    });

    const text = msg.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    let parsed: EnrichOutput;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error(`[enrich] JSON parse failed for ${name}: ${text.slice(0, 200)}`);
      continue;
    }

    const cost = tokensToJpy(model, msg.usage);
    total += cost;

    if (parsed.tier !== tierFromScore(parsed.score)) parsed.tier = tierFromScore(parsed.score);

    console.log(`[enrich] ${name} → ${parsed.persona}/${parsed.tier}/score=${parsed.score} ¥${cost}`);

    if (dryRun) continue;

    await updatePage(lead.id, {
      persona: prop.select(parsed.persona),
      score: prop.number(parsed.score),
      tier: prop.select(parsed.tier),
      score_reason: prop.text(parsed.score_reason),
      signals: prop.multi(parsed.signals),
      recent_post_summary: prop.text(parsed.recent_post_summary),
      status: prop.select("scored"),
      last_touched_at: prop.date(new Date().toISOString().slice(0, 10)),
      pay_token_cost_jpy: prop.number(Math.round(cost * 100) / 100),
    });
  }

  console.log(`[enrich] done. total cost ¥${total.toFixed(2)}`);
}
