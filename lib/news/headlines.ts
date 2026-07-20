const RSS_FEEDS = [
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
] as const;

const FALLBACK_HEADLINES = [
  "Global markets watch central bank policy signals",
  "Climate and energy talks continue across major capitals",
  "Technology and diplomacy shape the week ahead",
] as const;

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseRssTitles(xml: string, limit: number): string[] {
  const titles: string[] = [];
  const itemPattern =
    /<item[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) && titles.length < limit) {
    const title = decodeEntities(match[1] ?? "");
    if (!title || titles.includes(title)) continue;
    if (/bbc news|nytimes|podcast|rss/i.test(title)) continue;
    titles.push(title);
  }

  return titles;
}

/** Fetch up to three current world headlines (RSS — no API key). */
export async function fetchTopHeadlines(limit = 3): Promise<string[]> {
  for (const feedUrl of RSS_FEEDS) {
    try {
      const res = await fetch(feedUrl, {
        next: { revalidate: 900 },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const titles = parseRssTitles(xml, limit);
      if (titles.length >= limit) return titles.slice(0, limit);
      if (titles.length > 0) {
        while (titles.length < limit) {
          titles.push(FALLBACK_HEADLINES[titles.length % FALLBACK_HEADLINES.length]);
        }
        return titles.slice(0, limit);
      }
    } catch {
      // Try next feed.
    }
  }

  return [...FALLBACK_HEADLINES].slice(0, limit);
}
