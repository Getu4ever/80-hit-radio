"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { unlockMediaGesture } from "@/lib/mediaPlayback";
import {
  createSpeechRecognition,
  findTrackByVoiceQuery,
  isSpeechRecognitionSupported,
  parseVoiceCommand,
} from "@/lib/voicePlayback";
import { useAudioStore } from "@/store/useAudioStore";
import { useCatalogStore } from "@/store/useCatalogStore";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";

type ToastKind = "success" | "error" | "info";

type ToastState = {
  message: string;
  kind: ToastKind;
} | null;

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 11a7 7 0 0 1-14 0"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 17v4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8" />
    </svg>
  );
}

type VoiceAssistantProps = {
  /** Optional — mirror the parsed phrase into the catalog search field. */
  onSearchQuery?: (query: string) => void;
  className?: string;
};

export default function VoiceAssistant({
  onSearchQuery,
  className = "",
}: VoiceAssistantProps) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => isSpeechRecognitionSupported());
  const [toast, setToast] = useState<ToastState>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const playTrack = useAudioStore((s) => s.playTrack);
  const tracks = useCatalogStore((s) => s.tracks);
  const catalogLoaded = useCatalogStore((s) => s.loaded);
  const streamingAllowed = useStreamAccessStore((s) => s.allowed);

  const showToast = useCallback((message: string, kind: ToastKind) => {
    setToast({ message, kind });
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
      }
      recognitionRef.current?.abort();
    };
  }, []);

  const handleTranscript = useCallback(
    (transcript: string) => {
      const query = parseVoiceCommand(transcript);
      if (!query) {
        showToast("Say “play” followed by a song or artist.", "info");
        return;
      }

      onSearchQuery?.(query);

      if (!catalogLoaded || tracks.length === 0) {
        showToast("Catalog still loading — try again in a moment.", "info");
        return;
      }

      const match = findTrackByVoiceQuery(query, tracks);
      if (!match) {
        showToast("Could not find that track in our 80s archives.", "error");
        return;
      }

      unlockMediaGesture();
      playTrack(match);
      showToast(`Playing: ${match.title} — ${match.artist}…`, "success");
    },
    [catalogLoaded, onSearchQuery, playTrack, showToast, tracks],
  );

  const toggleListening = useCallback(() => {
    if (!supported) {
      showToast("Voice control is not supported in this browser.", "info");
      return;
    }
    if (!streamingAllowed) {
      showToast("Subscription required to stream.", "info");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = createSpeechRecognition();
    if (!recognition) {
      showToast("Voice control is not supported in this browser.", "info");
      return;
    }

    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event) => {
      setListening(false);
      recognitionRef.current = null;
      if (event.error === "aborted" || event.error === "no-speech") return;
      if (event.error === "not-allowed") {
        showToast("Microphone access was denied.", "error");
        return;
      }
      showToast("Voice capture failed — please try again.", "error");
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (!transcript.trim()) return;
      handleTranscript(transcript);
    };

    try {
      recognition.start();
      showToast("Listening…", "info");
    } catch {
      showToast("Could not start voice capture.", "error");
      setListening(false);
    }
  }, [handleTranscript, listening, showToast, streamingAllowed, supported]);

  if (!supported) return null;

  const toastPortal =
    toast && typeof document !== "undefined"
      ? createPortal(
          <div
            role="status"
            aria-live="polite"
            className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[200] max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-center text-sm shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur-xl ${
              toast.kind === "success"
                ? "border-cyan-400/35 bg-[#0a0614]/95 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                : toast.kind === "error"
                  ? "border-fuchsia-400/30 bg-[#0a0614]/95 text-fuchsia-100 shadow-[0_0_20px_rgba(217,70,239,0.15)]"
                  : "border-white/15 bg-[#0a0614]/95 text-white/80"
            }`}
          >
            {toast.message}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={toggleListening}
        disabled={!streamingAllowed}
        aria-pressed={listening}
        aria-label={
          listening ? "Stop voice search" : "Voice search — say play and a song"
        }
        title={
          listening
            ? "Listening… click to stop"
            : "Voice search — e.g. “play Michael Jackson Thriller”"
        }
        className={`voice-mic-btn relative shrink-0 rounded-lg p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${
          listening
            ? "text-cyan-200"
            : "text-cyan-300/80 hover:bg-cyan-400/10 hover:text-cyan-200"
        } ${className}`}
      >
        {listening ? (
          <>
            <span
              className="voice-mic-ripple absolute inset-0 rounded-lg bg-cyan-400/20"
              aria-hidden
            />
            <span
              className="voice-mic-ripple voice-mic-ripple-delay absolute inset-0 rounded-lg bg-cyan-400/10"
              aria-hidden
            />
          </>
        ) : null}
        <MicIcon className="relative z-[1] h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
      </button>
      {toastPortal}
    </>
  );
}
