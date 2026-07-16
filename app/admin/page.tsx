import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import AdminRealtimeTelemetry from "@/components/admin/AdminRealtimeTelemetry";
import AdminCatalog from "@/components/admin/AdminCatalog";
import AdminArtists from "@/components/admin/AdminArtists";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/");
  }

  if (profile.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#07040f] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-30" aria-hidden>
        <div className="absolute -left-28 top-10 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-[100px]" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-cyan-500/15 blur-[120px]" />
      </div>

      <main className="relative mx-auto max-w-7xl px-4 py-10 sm:px-8 lg:px-12">
        <section className="mb-10 rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-[0_0_80px_rgba(84,82,186,0.14)] backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-400/70">
            Rithmgen command center
          </p>
          <h1 className="mt-3 text-4xl font-[family-name:var(--font-display)] font-semibold text-white sm:text-5xl">
            Admin Operations
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/60">
            Full operational control for catalog management, artist asset uploads,
            and real-time audience telemetry. Only authenticated administrators
            may access this panel.
          </p>
        </section>

        <div className="space-y-8">
          <AdminRealtimeTelemetry />

          <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-8">
              <AdminCatalog />
            </div>
            <div className="space-y-8">
              <AdminArtists />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
