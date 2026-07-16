import { NextResponse } from "next/server";
import { requireAdmin, getAdminMetrics } from "@/lib/auth/session";
import { getCatalogSummary, getSiteAnalytics } from "@/lib/catalog/server";

export async function GET() {
  try {
    await requireAdmin();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  try {
    const [userMetrics, siteAnalytics, catalog] = await Promise.all([
      getAdminMetrics(),
      getSiteAnalytics(),
      getCatalogSummary(),
    ]);

    return NextResponse.json({
      users: userMetrics,
      site: siteAnalytics,
      catalog: {
        totalTracks: catalog.total,
        source: catalog.source,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/analytics:", err);
    const message =
      err instanceof Error ? err.message : "Failed to load analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
