import { runApifyActor, profileToRawInput, ApifyProfile } from "./apify";
import { queryDataSource, createPage, prop } from "./notion";

export async function runIngest(dryRun: boolean) {
  const leadsDsId = process.env.NOTION_LEADS_DS_ID!;
  const maxPerRun = Number(process.env.INGEST_MAX_PER_RUN ?? 30);

  console.log(`[ingest] running Apify actor...`);
  const profiles = await runApifyActor();
  console.log(`[ingest] Apify returned ${profiles.length} profiles`);

  const existingUrls = await loadExistingUrls(leadsDsId);
  console.log(`[ingest] ${existingUrls.size} existing leads in Notion`);

  const fresh = profiles.filter((p) => p.url && !existingUrls.has(normalizeUrl(p.url)));
  const batch = fresh.slice(0, maxPerRun);
  console.log(`[ingest] ${fresh.length} new, processing ${batch.length} this run`);

  let created = 0;
  for (const p of batch) {
    const rawInput = profileToRawInput(p);
    if (!rawInput) {
      console.log(`[ingest] skip ${p.url} (empty raw_input)`);
      continue;
    }

    if (dryRun) {
      console.log(`[ingest] DRY: would create ${p.fullName} (${p.url})`);
      created++;
      continue;
    }

    await createPage(leadsDsId, {
      name: prop.title(p.fullName || p.url),
      linkedin_url: { url: p.url },
      company: prop.text(p.companyName),
      title: prop.text(p.headline),
      raw_input: prop.text(rawInput.slice(0, 1900)),
      status: prop.select("new"),
    });
    created++;
  }

  console.log(`[ingest] created ${created} leads`);
}

async function loadExistingUrls(leadsDsId: string): Promise<Set<string>> {
  const all = await queryDataSource(leadsDsId);
  const set = new Set<string>();
  for (const page of all) {
    const url = page.properties?.linkedin_url?.url;
    if (url) set.add(normalizeUrl(url));
  }
  return set;
}

function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, "").split("?")[0];
}
