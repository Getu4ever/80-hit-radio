"use client";

import { useEffect, useState } from "react";
import { canOfferPwaInstall, usePwaInstallStore } from "@/lib/pwaInstall";

type InstallAppLinkProps = {
  className?: string;
  onClick?: () => void;
  /** Use menuitem when rendered inside a dropdown menu. */
  asMenuItem?: boolean;
};

/** Re-opens install help after “Not now”, or runs Chrome’s install prompt. */
export default function InstallAppLink({
  className = "",
  onClick,
  asMenuItem = false,
}: InstallAppLinkProps) {
  const [offer, setOffer] = useState(false);
  const requestInstallHelp = usePwaInstallStore((s) => s.requestInstallHelp);
  const tryNativePrompt = usePwaInstallStore((s) => s.tryNativePrompt);
  const deferredPrompt = usePwaInstallStore((s) => s.deferredPrompt);

  useEffect(() => {
    setOffer(canOfferPwaInstall());
  }, []);

  if (!offer) return null;

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
        requestInstallHelp();
      }}
    >
      Install app
    </button>
  );
}
