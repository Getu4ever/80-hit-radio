import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import HelpInstallSection from "@/components/HelpInstallSection";
import { getSupportEmail } from "@/lib/email/resend";

export const metadata: Metadata = {
  title: "Help & Support",
  description:
    "How RithmGen works: free trial, listening, accounts, billing, and confirmation email. Contact support@rithmgen.co.uk.",
  openGraph: {
    title: "Help & Support · RithmGen",
    description:
      "How RithmGen works: free trial, listening, accounts, billing, and confirmation email.",
  },
  twitter: {
    title: "Help & Support · RithmGen",
    description:
      "How RithmGen works: free trial, listening, accounts, billing, and confirmation email.",
  },
};

const SECTIONS = [
  {
    id: "getting-started",
    title: "Getting started",
    body: [
      "Create a free account with email or Google. Email signups need a quick confirmation link before you can sign in.",
      "New listeners get a 14-day free trial — no card required to start. After the trial, Premium keeps the broadcast uninterrupted.",
    ],
  },
  {
    id: "listening",
    title: "Listening to the station",
    body: [
      "Open the On Air deck, press play, and the continuous 80s broadcast keeps going as you move around the site.",
      "Playback stops when you sign out on that device. Guests can sample a short listen before creating an account.",
      "For the best experience on your phone, install RithmGen to your Home Screen (Help → Install the app, or the Install app link in the header).",
      "While a song is on air, use On this track to leave a short reaction or note — the lounge follows the current track so it stays calm and in the moment.",
    ],
  },
  {
    id: "account",
    title: "Your account & Listener Lounge",
    body: [
      "The Listener Lounge is your membership home — display name, profile picture, trial or Premium status, and billing controls.",
      "You can update your full name and upload a profile picture anytime. Google sign-in uses your Google photo by default until you upload your own.",
    ],
  },
  {
    id: "email",
    title: "Confirmation email",
    body: [
      "After email signup, check your inbox (and spam) for “Confirm your RithmGen email address”.",
      "Click the button or paste the link into your browser. If the link expired, sign up again with the same email or contact support.",
    ],
  },
  {
    id: "billing",
    title: "Billing basics",
    body: [
      "Premium is a simple monthly membership. Manage it from Billing on rithmgen.co.uk; card updates and cancel confirm in Stripe’s secure flows.",
      "Canceling ends access after the current billing period. Trial listeners can upgrade from Pricing or the Listener Lounge.",
    ],
  },
] as const;

export default function HelpPage() {
  const supportEmail = getSupportEmail();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07040f] px-4 py-10 pb-32 text-white sm:px-8">
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden opacity-40"
        aria-hidden
      >
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-[100px]" />
        <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-cyan-500/15 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <div className="mb-8 animate-fade-up">
          <BrandLogo size="lg" href="/" />
          <p className="mt-5 text-xs uppercase tracking-[0.35em] text-cyan-400/70">
            Station desk
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300 sm:text-4xl">
            Help & support
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50">
            How the dial works — trial, listening, account, and billing — the
            old-school radio community way.
          </p>
          <nav className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white/65 transition hover:bg-white/10 hover:text-white"
            >
              On Air
            </Link>
            <Link
              href="/dashboard/profile"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white/65 transition hover:bg-white/10 hover:text-white"
            >
              Listener Lounge
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white/65 transition hover:bg-white/10 hover:text-white"
            >
              Pricing
            </Link>
          </nav>
        </div>

        <div className="space-y-8">
          {SECTIONS.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className="animate-fade-up border-t border-white/10 pt-6"
              style={{ animationDelay: `${Math.min(index, 5) * 60}ms` }}
            >
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-white">
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-white/55">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}

          <HelpInstallSection />

          <section
            id="contact"
            className="animate-fade-up border-t border-cyan-400/25 pt-6"
          >
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-white">
              Contact the station
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              Questions about your account, trial, or billing? Reach the desk
              at{" "}
              <a
                href={`mailto:${supportEmail}`}
                className="font-medium text-cyan-300 underline-offset-2 hover:underline"
              >
                {supportEmail}
              </a>
              . We usually reply within one business day.
            </p>
            <a
              href={`mailto:${supportEmail}?subject=RithmGen%20support`}
              className="mt-5 inline-flex rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_18px_rgba(217,70,239,0.35)] transition hover:brightness-110"
            >
              Email support
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}
