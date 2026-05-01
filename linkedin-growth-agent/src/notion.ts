const NOTION_VERSION = "2025-09-03";

type Json = Record<string, unknown>;

async function notionFetch(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://api.notion.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion ${res.status} ${path}: ${body}`);
  }
  return res.json();
}

export async function queryDataSource(
  dataSourceId: string,
  filter?: Json,
  pageSize = 50
): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  do {
    const body: Json = { page_size: pageSize };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;
    const r = await notionFetch(`/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    all.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return all;
}

export async function updatePage(pageId: string, properties: Json): Promise<any> {
  return notionFetch(`/v1/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

export async function createPage(
  dataSourceId: string,
  properties: Json
): Promise<any> {
  return notionFetch(`/v1/pages`, {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
    }),
  });
}

export const prop = {
  title: (s: string) => ({ title: [{ type: "text", text: { content: s } }] }),
  text: (s: string) => ({ rich_text: [{ type: "text", text: { content: s } }] }),
  select: (name: string) => ({ select: { name } }),
  multi: (names: string[]) => ({ multi_select: names.map((name) => ({ name })) }),
  number: (n: number) => ({ number: n }),
  date: (iso: string) => ({ date: { start: iso, time_zone: "Asia/Tokyo" } }),
  relation: (ids: string[]) => ({ relation: ids.map((id) => ({ id })) }),
  checkbox: (b: boolean) => ({ checkbox: b }),
};

export function readTitle(page: any, propName: string): string {
  const arr = page.properties?.[propName]?.title ?? [];
  return arr.map((r: any) => r.plain_text).join("");
}

export function readText(page: any, propName: string): string {
  const arr = page.properties?.[propName]?.rich_text ?? [];
  return arr.map((r: any) => r.plain_text).join("");
}

export function readSelect(page: any, propName: string): string | null {
  return page.properties?.[propName]?.select?.name ?? null;
}

export function readUrl(page: any, propName: string): string | null {
  return page.properties?.[propName]?.url ?? null;
}

export function readRelationIds(page: any, propName: string): string[] {
  return (page.properties?.[propName]?.relation ?? []).map((r: any) => r.id);
}
