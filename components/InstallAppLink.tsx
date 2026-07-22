"use client";

import { useEffect, useState } from "react";
import { isPwaInstallAvailable, usePwaInstallStore } from "@/lib/pwaInstall";

type InstallAppLinkProps = {
  className?: string;
  onClick?: () => void;
  /** Use menuitem when rendered inside a dropdown menu. */
  asMenuItem?: boolean;
};

/** Shown only when a real install path exists (browser prompt or iOS Add to Home Screen). */
export default function InstallAppLink({
  className = "",
  onClick,
  asMenuItem = false,
}: InstallAppLinkProps) {
  const [mounted, setMounted] = useState(false);
  const requestInstallHelp = usePwaInstallStore((s) => s.requestInstallHelp);
  const tryNativePrompt = usePwaInstallStore((s) => s.tryNativePrompt);
  const deferredPrompt = usePwaInstallStore((s) => s.deferredPrompt);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isPwaInstallAvailable(deferredPrompt)) return null;

  return (
    <button
      type="button"
      role={asMenuItem ? "menuitem" : undefined}
      className={className}
      onClick={() => {
        onClick?.();
        if (deferredPrompt) {
          void tryNativePrompt();
          return;
        }
        // iOS: reopen the Add to Home Screen tip panel.
        requestInstallHelp();
      }}
    >
      Install app
    </button>
  );
}
