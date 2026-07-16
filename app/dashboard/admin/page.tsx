import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import AdminStudioPanel from "@/components/AdminStudioPanel";
import DashboardChrome from "@/components/DashboardChrome";

export const dynamic = "force-dynamic";

export default async function AdminPanelPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/");
  }

  if (profile.role !== "admin") {
    redirect("/dashboard/profile");
  }

  return (
    <div className="min-h-screen bg-[#07040f] px-4 py-10 pb-32 text-white sm:px-8">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        aria-hidden
      >
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-cyan-500/15 blur-[110px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <DashboardChrome
          eyebrow="Broadcast engineering"
          title="Studio Control"
          subtitle="Full studio control — site analytics, catalog management, artist portraits, and listener access."
        />

        <AdminStudioPanel />
      </div>
    </div>
  );
}
