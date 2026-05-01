import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { runIngest } from "./ingest";
import { runEnrich } from "./enrich";
import { runDraft } from "./draft";

async function main() {
  const required = [
    "ANTHROPIC_API_KEY",
    "NOTION_TOKEN",
    "NOTION_LEADS_DS_ID",
    "NOTION_DM_DRAFTS_DS_ID",
    "APIFY_TOKEN",
    "APIFY_ACTOR_ID",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")}`);
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
  const dryRun = process.env.DRY_RUN === "1";
  const skipIngest = process.env.SKIP_INGEST === "1";

  console.log(`[agent] model=${model} dryRun=${dryRun} skipIngest=${skipIngest}`);
  if (!skipIngest) {
    console.log(`[agent] === pass 0: ingest ===`);
    await runIngest(dryRun);
  }
  console.log(`[agent] === pass 1: enrich ===`);
  await runEnrich(client, model, dryRun);
  console.log(`[agent] === pass 2: draft ===`);
  await runDraft(client, model, dryRun);
  console.log(`[agent] all done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
