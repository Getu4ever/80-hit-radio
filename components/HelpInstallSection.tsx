"use client";

import { useEffect, useState } from "react";
import InstallAppLink from "@/components/InstallAppLink";
import { canOfferPwaInstall, isIosDevice } from "@/lib/pwaInstall";

export default function HelpInstallSection() {
  const [offer, setOffer] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setOffer(canOfferPwaInstall());
    setIos(isIosDevice());
  }, []);

  if (!offer) return null;

  return (
    <section
      id="install-app"
      className="animate-fade-up border-t border-white/10 pt-6"
    >
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-white">
        Install the app
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-white/55">
        {ios
          ? "On iPhone/iPad, open this site in Safari, tap Share, scroll down, then Add to Home Screen. If you dismissed the install tip earlier, use the button below to show it again."
          : "Install RithmGen for a dedicated radio window and quicker launch. If you dismissed the install tip earlier, use the button below to show it again."}
      </p>
      <InstallAppLink className="mt-5 inline-flex rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/15" />
    </section>
  );
}
