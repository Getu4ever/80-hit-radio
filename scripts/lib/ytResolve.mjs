/**
 * Official-first YouTube video resolution for RithmGen catalog builds.
 *
 * Scrapes youtube.com/results (no Data API required), ranks candidates by
 * artist/VEVO/Official channel signals, and falls back to the highest-viewed
 * non-Short when no official upload appears in the top results.
 *
 * Optional: set YOUTUBE_API_KEY to enrich top candidates with
 * contentDetails.definition (hd/sd) via videos.list.
 */

export const YT_RESOLVE_CACHE_VERSION = 3;

/** @typedef {{
 *   videoId: string,
 *   title: string,
 *   channelTitle: string,
 *   viewCount: number,
 *   durationSec: number,
 *   officialChannel: boolean,
 *   officialTitle: boolean,
 *   verifiedBadge: boolean,
 *   definition: 'hd' | 'sd' | 'unknown',
 *   score: number,
 *   query: string,
 *   rankInQuery: number,
 * }} YtCandidate */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SEARCH_SUFFIXES = [
  "Official Audio",
  "Official Music Video",
  "Remastered",
  "Official Video",
];

const FAKE_ID = /xRockPad|xPopPad|aAfr80s|mN8kYqL3VxY|_vK5m|YqL\d|Qm[A-Z0-9]{2,}[A-Z]/i;

export function isRealYoutubeId(id) {
  return (
    typeof id === "string" &&
    id.length === 11 &&
    /^[A-Za-z0-9_-]{11}$/.test(id) &&
    !FAKE_ID.test(id)
  );
}

function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function artistTokens(artist) {
  return normalize(artist)
    .split(" ")
    .filter((t) => t.length > 1 && !["the", "and", "feat", "ft", "with"].includes(t));
}

/** @param {string} text */
export function parseViewCount(text) {
  if (!text) return 0;
  const cleaned = String(text).replace(/,/g, "").trim();
  const m = cleaned.match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  let n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const suf = (m[2] || "").toUpperCase();
  if (suf === "K") n *= 1e3;
  if (suf === "M") n *= 1e6;
  if (suf === "B") n *= 1e9;
  return Math.round(n);
}

/** @param {string} text e.g. "4:23" or "1:02:15" */
export function parseDurationSec(text) {
  if (!text) return 0;
  const parts = String(text)
    .trim()
    .split(":")
    .map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

/**
 * @param {string} artist
 * @param {string} channelTitle
 * @param {boolean} verifiedBadge
 */
export function isOfficialChannel(artist, channelTitle, verifiedBadge = false) {
  const ch = normalize(channelTitle);
  if (!ch) return false;
  if (/\bvevo\b/.test(ch)) return true;
  if (/\bofficial\b/.test(ch)) return true;
  if (/\btopic\b/.test(ch)) return true; // YouTube Music auto-generated artist Topic channels
  if (verifiedBadge) return true;

  const tokens = artistTokens(artist);
  if (!tokens.length) return false;
  // Require most artist tokens to appear in the channel name.
  const hits = tokens.filter((t) => ch.includes(t)).length;
  return hits >= Math.ceil(tokens.length * 0.6);
}

/** @param {string} title */
export function hasOfficialTitle(title) {
  const t = normalize(title);
  return (
    t.includes("official audio") ||
    t.includes("official music video") ||
    t.includes("official video") ||
    t.includes("official lyric") ||
    t.includes("remastered") ||
    t.includes("remaster")
  );
}

/**
 * @param {object} renderer videoRenderer-like object from ytInitialData
 * @param {string} artist
 * @param {string} query
 * @param {number} rankInQuery
 * @returns {YtCandidate | null}
 */
function candidateFromRenderer(renderer, artist, query, rankInQuery) {
  const videoId = renderer?.videoId;
  if (!isRealYoutubeId(videoId)) return null;

  const title =
    renderer.title?.runs?.map((r) => r.text).join("") ||
    renderer.title?.simpleText ||
    "";
  const channelTitle =
    renderer.ownerText?.runs?.[0]?.text ||
    renderer.longBylineText?.runs?.[0]?.text ||
    renderer.shortBylineText?.runs?.[0]?.text ||
    "";

  const viewText =
    renderer.viewCountText?.simpleText ||
    renderer.viewCountText?.runs?.map((r) => r.text).join("") ||
    renderer.shortViewCountText?.simpleText ||
    "";
  const durationText =
    renderer.lengthText?.simpleText ||
    renderer.lengthText?.runs?.[0]?.text ||
    "";

  let verifiedBadge = false;
  const badgeLists = [
    renderer.ownerBadges,
    renderer.badges,
    renderer.avatar?.badges,
  ];
  for (const list of badgeLists) {
    if (!Array.isArray(list)) continue;
    for (const b of list) {
      const style =
        b?.metadataBadgeRenderer?.style ||
        b?.metadataBadgeRenderer?.icon?.iconType ||
        "";
      const label =
        b?.metadataBadgeRenderer?.tooltip ||
        b?.metadataBadgeRenderer?.accessibilityData?.label ||
        "";
      const blob = `${style} ${label}`.toUpperCase();
      if (
        blob.includes("VERIFIED") ||
        blob.includes("OFFICIAL_ARTIST") ||
        blob.includes("BADGE_STYLE_TYPE_VERIFIED") ||
        blob.includes("BADGE_STYLE_TYPE_VERIFIED_ARTIST")
      ) {
        verifiedBadge = true;
      }
    }
  }

  const officialChannel = isOfficialChannel(artist, channelTitle, verifiedBadge);
  const officialTitle = hasOfficialTitle(title);
  const viewCount = parseViewCount(viewText);
  const durationSec = parseDurationSec(durationText);

  /** @type {YtCandidate} */
  const c = {
    videoId,
    title,
    channelTitle,
    viewCount,
    durationSec,
    officialChannel,
    officialTitle,
    verifiedBadge,
    definition: "unknown",
    score: 0,
    query,
    rankInQuery,
  };
  c.score = scoreCandidate(c);
  return c;
}

/** @param {YtCandidate} c */
export function scoreCandidate(c) {
  let score = 0;
  if (c.officialChannel) score += 1000;
  if (c.verifiedBadge) score += 200;
  if (c.officialTitle) score += 300;
  if (c.definition === "hd") score += 150;
  if (c.definition === "sd") score -= 80;
  // Prefer full tracks over Shorts / clips.
  if (c.durationSec >= 90 && c.durationSec <= 15 * 60) score += 80;
  if (c.durationSec > 0 && c.durationSec < 60) score -= 400;
  // Mild view-count signal (log scale).
  if (c.viewCount > 0) score += Math.min(120, Math.log10(c.viewCount + 1) * 20);
  // Prefer earlier search ranks slightly.
  score += Math.max(0, 30 - c.rankInQuery * 3);
  return score;
}

/**
 * Walk ytInitialData and collect videoRenderer nodes.
 * @param {unknown} node
 * @param {object[]} out
 */
function collectVideoRenderers(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out);
    return;
  }
  const obj = /** @type {Record<string, unknown>} */ (node);
  if (obj.videoRenderer && typeof obj.videoRenderer === "object") {
    out.push(obj.videoRenderer);
  }
  for (const value of Object.values(obj)) {
    collectVideoRenderers(value, out);
  }
}

/** @param {string} html */
function extractYtInitialData(html) {
  const markers = [
    /var ytInitialData\s*=\s*(\{.*?\});<\/script>/s,
    /ytInitialData\s*=\s*(\{.*?\});<\/script>/s,
    /window\["ytInitialData"\]\s*=\s*(\{.*?\});<\/script>/s,
  ];
  for (const re of markers) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    try {
      return JSON.parse(m[1]);
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Fallback when ytInitialData parse fails: pull ordered unique videoIds.
 * @param {string} html
 * @param {string} artist
 * @param {string} query
 * @returns {YtCandidate[]}
 */
function candidatesFromRegex(html, artist, query) {
  const ids = [
    ...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g),
  ].map((m) => m[1]);
  const seen = new Set();
  /** @type {YtCandidate[]} */
  const out = [];
  for (const videoId of ids) {
    if (!isRealYoutubeId(videoId) || seen.has(videoId)) continue;
    seen.add(videoId);
    /** @type {YtCandidate} */
    const c = {
      videoId,
      title: "",
      channelTitle: "",
      viewCount: 0,
      durationSec: 0,
      officialChannel: false,
      officialTitle: false,
      verifiedBadge: false,
      definition: "unknown",
      score: 0,
      query,
      rankInQuery: out.length,
    };
    c.score = scoreCandidate(c);
    out.push(c);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * @param {string} html
 * @param {string} artist
 * @param {string} query
 * @returns {YtCandidate[]}
 */
export function parseSearchCandidates(html, artist, query) {
  const data = extractYtInitialData(html);
  if (data) {
    /** @type {object[]} */
    const renderers = [];
    collectVideoRenderers(data, renderers);
    /** @type {YtCandidate[]} */
    const out = [];
    const seen = new Set();
    for (const renderer of renderers) {
      const c = candidateFromRenderer(renderer, artist, query, out.length);
      if (!c || seen.has(c.videoId)) continue;
      seen.add(c.videoId);
      out.push(c);
      if (out.length >= 12) break;
    }
    if (out.length) return out;
  }
  return candidatesFromRegex(html, artist, query);
}

/**
 * @param {string} q
 * @param {number} tries
 */
export async function fetchSearchHtml(q, tries = 4) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`; // Video filter
      const r = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (err) {
      lastErr = err;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  if (lastErr) throw lastErr;
  return "";
}

/**
 * Optionally mark definition via YouTube Data API videos.list.
 * @param {YtCandidate[]} candidates
 * @param {string | undefined} apiKey
 */
export async function enrichDefinitions(candidates, apiKey) {
  if (!apiKey || !candidates.length) return candidates;
  const ids = [...new Set(candidates.map((c) => c.videoId))].slice(0, 15);
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet` +
      `&id=${ids.join(",")}&key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url);
    if (!r.ok) return candidates;
    const json = await r.json();
    /** @type {Map<string, { definition: 'hd'|'sd'|'unknown', viewCount: number, channelTitle: string, title: string }>} */
    const byId = new Map();
    for (const item of json.items ?? []) {
      const def = item.contentDetails?.definition === "hd" ? "hd" : item.contentDetails?.definition === "sd" ? "sd" : "unknown";
      byId.set(item.id, {
        definition: def,
        viewCount: Number.parseInt(item.statistics?.viewCount ?? "0", 10) || 0,
        channelTitle: item.snippet?.channelTitle ?? "",
        title: item.snippet?.title ?? "",
      });
    }
    for (const c of candidates) {
      const info = byId.get(c.videoId);
      if (!info) continue;
      c.definition = info.definition;
      if (info.viewCount > c.viewCount) c.viewCount = info.viewCount;
      if (info.channelTitle && !c.channelTitle) c.channelTitle = info.channelTitle;
      if (info.title && !c.title) c.title = info.title;
      c.officialTitle = c.officialTitle || hasOfficialTitle(c.title);
      c.score = scoreCandidate(c);
    }
  } catch {
    // Keep scrape-only ranking.
  }
  return candidates;
}

/**
 * Selection rules:
 * 1. Prefer official-channel (or strong official title) in the first 3 results of any query.
 * 2. Else pick highest-viewed HD (or best score) among remaining candidates.
 *
 * @param {YtCandidate[]} candidates
 * @returns {{ pick: YtCandidate | null, reason: string }}
 */
export function selectBestCandidate(candidates) {
  if (!candidates.length) return { pick: null, reason: "no-candidates" };

  const top3Official = candidates
    .filter((c) => c.rankInQuery < 3 && (c.officialChannel || (c.officialTitle && c.verifiedBadge)))
    .sort((a, b) => b.score - a.score);
  if (top3Official[0]) {
    return { pick: top3Official[0], reason: "official-top3" };
  }

  const anyOfficial = candidates
    .filter((c) => c.officialChannel || c.officialTitle)
    .sort((a, b) => b.score - a.score);
  if (anyOfficial[0] && anyOfficial[0].score >= 300) {
    return { pick: anyOfficial[0], reason: "official-best" };
  }

  const hdPool = candidates.filter(
    (c) =>
      c.definition === "hd" ||
      (c.definition === "unknown" && c.durationSec >= 90),
  );
  const pool = (hdPool.length ? hdPool : candidates).slice();
  pool.sort((a, b) => {
    if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
    return b.score - a.score;
  });
  if (pool[0]) {
    return {
      pick: pool[0],
      reason: pool[0].definition === "hd" ? "fallback-hd-views" : "fallback-views",
    };
  }
  return { pick: candidates[0], reason: "first" };
}

/**
 * Build strict search queries for a track.
 * @param {string} artist
 * @param {string} title
 */
export function buildSearchQueries(artist, title) {
  const base = `${artist} ${title}`.trim();
  return SEARCH_SUFFIXES.map((suffix) => `${base} ${suffix}`);
}

/**
 * Resolve the best official (or HD fallback) YouTube ID for a track.
 *
 * @param {string} artist
 * @param {string} title
 * @param {{
 *   cache?: Record<string, unknown>,
 *   apiKey?: string,
 *   sleepMs?: number,
 * }} [opts]
 * @returns {Promise<{ videoId: string | null, reason: string, candidate: YtCandidate | null }>}
 */
export async function resolveOfficialVideo(artist, title, opts = {}) {
  const cache = opts.cache ?? {};
  const trackKey = `track:${normalize(artist)}|${normalize(title)}`;
  const cached = cache[trackKey];
  if (cached && typeof cached === "object" && cached !== null) {
    const hit = /** @type {{ videoId?: string, reason?: string }} */ (cached);
    if (isRealYoutubeId(hit.videoId)) {
      return {
        videoId: hit.videoId,
        reason: hit.reason ?? "cache",
        candidate: null,
      };
    }
  }

  /** @type {YtCandidate[]} */
  const all = [];
  const seen = new Set();

  for (const query of buildSearchQueries(artist, title)) {
    try {
      const html = await fetchSearchHtml(query);
      const batch = parseSearchCandidates(html, artist, query);
      for (const c of batch) {
        if (seen.has(c.videoId)) continue;
        seen.add(c.videoId);
        all.push(c);
      }
      // Early exit: official channel in top 3 of this query.
      const early = batch
        .filter((c) => c.rankInQuery < 3 && c.officialChannel)
        .sort((a, b) => b.score - a.score)[0];
      if (early) {
        await enrichDefinitions([early], opts.apiKey);
        early.score = scoreCandidate(early);
        cache[trackKey] = {
          videoId: early.videoId,
          reason: "official-top3-early",
          channelTitle: early.channelTitle,
          title: early.title,
        };
        return {
          videoId: early.videoId,
          reason: "official-top3-early",
          candidate: early,
        };
      }
    } catch {
      // try next suffix
    }
    if (opts.sleepMs) {
      await new Promise((res) => setTimeout(res, opts.sleepMs));
    }
  }

  await enrichDefinitions(all.slice(0, 10), opts.apiKey);
  for (const c of all) c.score = scoreCandidate(c);

  const { pick, reason } = selectBestCandidate(all);
  if (pick) {
    cache[trackKey] = {
      videoId: pick.videoId,
      reason,
      channelTitle: pick.channelTitle,
      title: pick.title,
      definition: pick.definition,
    };
  }
  return {
    videoId: pick?.videoId ?? null,
    reason,
    candidate: pick,
  };
}

/**
 * Load / migrate yt cache to the versioned track-key shape.
 * @param {string} cachePath
 * @param {{ existsSync: Function, readFileSync: Function }} fs
 */
export function loadYtCache(cachePath, fs) {
  if (!fs.existsSync(cachePath)) {
    return { __v: YT_RESOLVE_CACHE_VERSION };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (raw && typeof raw === "object" && raw.__v === YT_RESOLVE_CACHE_VERSION) {
      return raw;
    }
    // Invalidate legacy query→id maps so the new ranking can take effect.
    return { __v: YT_RESOLVE_CACHE_VERSION };
  } catch {
    return { __v: YT_RESOLVE_CACHE_VERSION };
  }
}

/**
 * @param {string} cachePath
 * @param {Record<string, unknown>} cache
 * @param {{ writeFileSync: Function }} fs
 */
export function saveYtCache(cachePath, cache, fs) {
  cache.__v = YT_RESOLVE_CACHE_VERSION;
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}
