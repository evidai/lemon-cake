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
  if (items[0]) {
    // One-time debug: log keys of first item so we can see what shape this actor returns.
    console.log("[apify] sample keys:", Object.keys(items[0]).slice(0, 30).join(", "));
  }
  return items.map(normalize).filter((p) => p.url);
}

function pickPublicId(item: any): string | undefined {
  return item.publicIdentifier ?? item.public_identifier ?? item.publicId ?? item.username;
}

function normalize(item: any): ApifyProfile {
  // Fix operator precedence bug: previous code mixed ?? and ?: without parens,
  // causing every item to fall through to "https://www.linkedin.com/in/undefined".
  const directUrl: string | undefined =
    item.url ??
    item.profileUrl ?? item.profile_url ??
    item.linkedinUrl ?? item.linkedin_url ??
    item.linkedinProfileUrl ?? item.profileURL;
  const pubId = pickPublicId(item);
  const url: string =
    directUrl ??
    (pubId ? `https://www.linkedin.com/in/${pubId}` : "");

  const firstName = item.firstName ?? item.first_name ?? "";
  const lastName  = item.lastName  ?? item.last_name  ?? "";
  const fullName: string =
    item.fullName ?? item.full_name ?? item.name ?? `${firstName} ${lastName}`.trim();

  const headline: string =
    item.headline ?? item.title ?? item.subTitle ?? item.sub_title ?? item.tagline ?? "";

  const companyName: string =
    item.companyName ?? item.company_name ??
    (typeof item.company === "string" ? item.company : item.company?.name) ??
    item.currentCompany?.name ?? item.current_company?.name ?? item.current_company ??
    item.experiences?.[0]?.companyName ?? item.experiences?.[0]?.company_name ??
    item.experience?.[0]?.company ??
    "";

  const about: string =
    item.about ?? item.summary ?? item.description ?? item.bio ?? "";

  const rawPosts: any[] =
    item.posts ?? item.recentPosts ?? item.recent_posts ?? item.activity ?? [];
  const posts = rawPosts.slice(0, 3).map((p: any) => ({
    text: p.text ?? p.content ?? p.commentary ?? "",
    postedAt: p.postedAt ?? p.posted_at ?? p.publishedAt ?? p.published_at ?? p.date,
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
