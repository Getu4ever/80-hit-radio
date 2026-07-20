import { serverEnv } from "@/lib/env";

/** ElevenLabs "Adam" — default high-fidelity male host voice. */
export const ELEVEN_ADAM_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

export function getElevenLabsApiKey(): string {
  return serverEnv("ELEVENLABS_API_KEY");
}

export function isElevenLabsConfigured(): boolean {
  const key = getElevenLabsApiKey();
  return Boolean(key) && !key.includes("placeholder");
}

export async function synthesizeLuxuryBulletin(text: string): Promise<Buffer> {
  const apiKey = getElevenLabsApiKey();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_ADAM_VOICE_ID}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_v3",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.78,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(
      `ElevenLabs TTS failed (${res.status}): ${detail.slice(0, 200)}`,
    );
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
