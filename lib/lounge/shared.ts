export const LOUNGE_REACTIONS = ["🔥", "🕺", "💜", "✨", "🙌"] as const;

export type LoungeReactionEmoji = (typeof LOUNGE_REACTIONS)[number];

export const LOUNGE_MAX_MESSAGE_LENGTH = 140;
export const LOUNGE_MESSAGE_LIMIT = 24;
/** Soft rate limit — one comment every few seconds keeps the room calm. */
export const LOUNGE_POST_COOLDOWN_MS = 8_000;
export const LOUNGE_POLL_MS = 5_000;

export function isLoungeReactionEmoji(
  value: string,
): value is LoungeReactionEmoji {
  return (LOUNGE_REACTIONS as readonly string[]).includes(value);
}

export function sanitizeLoungeBody(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, LOUNGE_MAX_MESSAGE_LENGTH);
}

export function loungeDisplayName(input: {
  fullName?: string | null;
  email?: string | null;
}): string {
  const name = input.fullName?.trim();
  if (name) return name.slice(0, 40);
  const email = input.email?.trim();
  if (email) {
    const local = email.split("@")[0] ?? "Listener";
    return local.slice(0, 40);
  }
  return "Listener";
}
