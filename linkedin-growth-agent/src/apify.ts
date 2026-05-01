export type ApifyProfile = {
  url: string;
  fullName: string;
  headline: string;
  companyName: string;
  about: string;
  posts: Array<{ text: string; postedAt?: string }>;
};

export async function runApifyActor(): Promise<ApifyProfile[]> {
  const token = process.env.APIFY_TOKEN!;
  const actorId = process.env.APIFY_ACTOR_ID!;
  const input = JSON.parse(process.env.APIFY_ACTOR_INPUT ?? "{}");

  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=600`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) {
    throw new Error(`Apify ${res.status}: ${await res.text()}`);
  }
  const items = (await res.json()) as any[];
  return items.map(normalize).filter((p) => p.url);
}

function normalize(item: any): ApifyProfile {
  const url: string =
    item.url ??
    item.profileUrl ??
    item.linkedinUrl ??
    item.publicIdentifier ? `https://www.linkedin.com/in/${item.publicIdentifier}` : "";

  const fullName: string =
    item.fullName ?? item.name ?? `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim();

  const headline: string = item.headline ?? item.title ?? item.subTitle ?? "";

  const companyName: string =
    item.companyName ??
    item.company?.name ??
    item.currentCompany?.name ??
    item.experiences?.[0]?.companyName ??
    "";

  const about: string = item.about ?? item.summary ?? item.description ?? "";

  const rawPosts: any[] = item.posts ?? item.recentPosts ?? item.activity ?? [];
  const posts = rawPosts.slice(0, 3).map((p: any) => ({
    text: p.text ?? p.content ?? p.commentary ?? "",
    postedAt: p.postedAt ?? p.publishedAt ?? p.date,
  }));

  return { url, fullName, headline, companyName, about, posts };
}

export function profileToRawInput(p: ApifyProfile): string {
  const parts: string[] = [];
  if (p.headline) parts.push(`# Headline\n${p.headline}`);
  if (p.about) parts.push(`# About\n${p.about}`);
  if (p.posts.length) {
    parts.push(
      `# Recent posts\n${p.posts
        .map((post, i) => `[${i + 1}]${post.postedAt ? ` (${post.postedAt})` : ""}\n${post.text}`)
        .join("\n\n")}`
    );
  }
  return parts.join("\n\n");
}
