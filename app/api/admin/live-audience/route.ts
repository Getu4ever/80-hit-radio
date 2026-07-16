import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getLiveAudienceMetrics } from "@/lib/catalog/server";

export async function GET() {
  try {
    await requireAdmin();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  try {
    const metrics = await getLiveAudienceMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    console.error("GET /api/admin/live-audience:", err);
    return NextResponse.json(
      { error: "Failed to load live audience metrics" },
      { status: 500 },
    );
  }
}
