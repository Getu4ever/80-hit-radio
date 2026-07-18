import type { User } from "@supabase/supabase-js";

/** Extract display name from Supabase / Google user metadata. */
export function nameFromUserMetadata(
  metadata: User["user_metadata"] | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const candidates = [
    metadata.full_name,
    metadata.name,
    metadata.display_name,
  ];
  for (const value of candidates) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed.slice(0, 120);
    }
  }
  return null;
}

function isHttpAvatarUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

/** Extract avatar URL from Supabase / Google user metadata. */
export function avatarFromUserMetadata(
  metadata: User["user_metadata"] | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const candidates = [metadata.avatar_url, metadata.picture];
  for (const value of candidates) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (isHttpAvatarUrl(trimmed)) {
        return trimmed.slice(0, 2048);
      }
    }
  }
  return null;
}

/**
 * Display resolution: stored profile avatar → Google/OAuth metadata → null
 * (UI shows initials when null). Never invents a second photo.
 */
export function resolveProfileAvatar(
  profileAvatar: string | null | undefined,
  metadata?: User["user_metadata"] | null,
): string | null {
  const stored = profileAvatar?.trim();
  if (stored && isHttpAvatarUrl(stored)) {
    return stored.slice(0, 2048);
  }
  return avatarFromUserMetadata(metadata);
}

export function displayNameForProfile(profile: {
  full_name?: string | null;
  email: string;
}): string {
  const name = profile.full_name?.trim();
  if (name) return name;
  const local = profile.email.split("@")[0]?.trim();
  return local || profile.email || "Listener";
}

export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "RG";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}
