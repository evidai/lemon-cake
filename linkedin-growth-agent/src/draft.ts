import Anthropic from "@anthropic-ai/sdk";
import {
  queryDataSource,
  updatePage,
  createPage,
  prop,
  readTitle,
  readText,
  readSelect,
  readRelationIds,
} from "./notion";
import { tokensToJpy } from "./cost";

type DraftOutput = {
  draft_body: string;
  reference_post: string;
};

const SYSTEM = `あなたはLemonCake (lemoncake.xyz) のLinkedIn DM起案エージェントです。

【絶対ルール（Base44流）】
1. 売り込みゼロ。LemonCakeの宣伝・URL・サービス名連呼を禁止。
2. 質問で終わる。相手が一行で返せる具体質問。
3. 4-6文、200-280字。冒頭は相手の発信への具体的言及（30-50字のフック）。
4. 「お忙しいところすみません」「突然のご連絡」など定型挨拶禁止。
5. 一人称は「うち」「自分」可。「弊社」禁止。
6. 同調→共通課題→質問の3段構成。
7. 絵文字・ハッシュタグ禁止。

ペルソナ別フック：
- A: 開発でハマっている技術課題に同調
- B: SaaS拡大とコスト/コンプラのジレンマに同調
- C: freee/会計DXの泥臭い現場感に同調
- D: 月末締めや支出可視化の痛みに同調

JSON以外を出力しないこと。Markdownコードフェンスも禁止。`;

const userTemplate = (
  name: string,
  persona: string,
  company: string,
  title: string,
  recentPostSummary: string,
  scoreReason: string
) =>
  `以下のリードに送るDMを起案。

name: ${name}
persona: ${persona}
company: ${company}
title: ${title}
recent_post_summary: ${recentPostSummary}
score_reason: ${scoreReason}

# 出力フォーマット
{
  "draft_body": "DM本文（改行可、200-280字、質問で終わる）",
  "reference_post": "相手の発信のどこに触れたか（一行）"
}`;

const personaToCode = (p: string): "A" | "B" | "C" | "D" => {
  if (p.startsWith("A")) return "A";
  if (p.startsWith("B")) return "B";
  if (p.startsWith("C")) return "C";
  return "D";
};

export async function runDraft(client: Anthropic, model: string, dryRun: boolean) {
  const leadsDsId = process.env.NOTION_LEADS_DS_ID!;
  const draftsDsId = process.env.NOTION_DM_DRAFTS_DS_ID!;

  const leads = await queryDataSource(leadsDsId, {
    and: [
      { property: "status", select: { equals: "scored" } },
      { property: "tier", select: { equals: "Tier1" } },
    ],
  });

  const targets = leads.filter((l) => readRelationIds(l, "dm_draft").length === 0);
  console.log(`[draft] ${targets.length} Tier1 leads without drafts`);
  let total = 0;

  for (const lead of targets) {
    const name = readTitle(lead, "name");
    const persona = readSelect(lead, "persona") ?? "A_Developer";
    const company = readText(lead, "company");
    const title = readText(lead, "title");
    const recent = readText(lead, "recent_post_summary");
    const reason = readText(lead, "score_reason");

    const msg = await client.messages.create({
      model,
      max_tokens: 800,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        { role: "user", content: userTemplate(name, persona, company, title, recent, reason) },
      ],
    });

    const text = msg.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    let parsed: DraftOutput;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error(`[draft] JSON parse failed for ${name}: ${text.slice(0, 200)}`);
      continue;
    }

    const cost = tokensToJpy(model, msg.usage);
    total += cost;
    const today = new Date().toISOString().slice(0, 10);

    console.log(`[draft] ${name} → ${parsed.draft_body.length}文字 ¥${cost}`);

    if (dryRun) continue;

    await createPage(draftsDsId, {
      title: prop.title(`To: ${name} (${today})`),
      draft_body: prop.text(parsed.draft_body),
      persona_used: prop.select(personaToCode(persona)),
      reference_post: prop.text(parsed.reference_post),
      approval_status: prop.select("pending"),
      reply_received: prop.checkbox(false),
      generation_cost_jpy: prop.number(Math.round(cost * 100) / 100),
      lead: prop.relation([lead.id]),
    });

    await updatePage(lead.id, {
      status: prop.select("outreach_drafted"),
      last_touched_at: prop.date(today),
    });
  }

  console.log(`[draft] done. total cost ¥${total.toFixed(2)}`);
}
