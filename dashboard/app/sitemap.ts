import type { MetadataRoute } from "next";

const BASE = "https://lemoncake.xyz";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`,                       lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/about`,                  lastModified: now, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${BASE}/about/en`,               lastModified: now, changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE}/integrations/freee`,     lastModified: now, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${BASE}/register`,               lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/login`,                  lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/support`,                lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/legal/terms`,            lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/legal/dify-plugin`,      lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];
}
