/**
 * Country detection for presentment currency.
 * Prefer Vercel edge geo (`x-vercel-ip-country`); fall back to Accept-Language.
 */

const DEFAULT_COUNTRY = "GB";

function parseAcceptLanguageCountry(header: string | null): string | null {
  if (!header) return null;

  for (const part of header.split(",")) {
    const tag = part.trim().split(";")[0]?.trim();
    if (!tag) continue;
    const region = tag.match(/^[a-zA-Z]{2,3}-([a-zA-Z]{2})\b/)?.[1];
    if (region) return region.toUpperCase();
  }

  return null;
}

/** ISO 3166-1 alpha-2 country code, defaulting to GB (UK site). */
export function detectCountryFromHeaders(headers: Headers): string {
  const vercelCountry = headers.get("x-vercel-ip-country")?.trim().toUpperCase();
  if (vercelCountry && /^[A-Z]{2}$/.test(vercelCountry) && vercelCountry !== "XX") {
    return vercelCountry;
  }

  const fromLanguage = parseAcceptLanguageCountry(headers.get("accept-language"));
  if (fromLanguage) return fromLanguage;

  return DEFAULT_COUNTRY;
}
