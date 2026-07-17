"use client";

import type { CSSProperties } from "react";

type SoundWaveProps = {
  active: boolean;
  className?: string;
};

/** Staggered bar heights (0–1) for an organic waveform silhouette. */
const BAR_PROFILE = [
  0.22, 0.35, 0.48, 0.62, 0.78, 0.92, 0.7, 0.55, 0.88, 1, 0.82, 0.6, 0.45, 0.72,
  0.95, 0.68, 0.4, 0.58, 0.85, 0.98, 0.75, 0.5, 0.38, 0.28,
] as const;

export default function SoundWave({ active, className = "" }: SoundWaveProps) {
  return (
    <div
      className={`sound-wave ${active ? "sound-wave--active" : ""} ${className}`}
      aria-hidden
    >
      {BAR_PROFILE.map((peak, index) => (
        <span
          key={index}
          className="sound-wave__bar"
          style={
            {
              "--bar-peak": peak,
              "--bar-delay": `${index * 0.045}s`,
              "--bar-duration": `${0.55 + (index % 5) * 0.12}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
