import { NextResponse } from "next/server";
import {
  requireAdmin,
  listAllProfiles,
  updateProfileById,
  getAdminMetrics,
} from "@/lib/auth/session";
import type {
  StripeSubscriptionStatus,
  UserRole,
} from "@/types/database.types";

export async function GET() {
  try {
    await requireAdmin();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  const [users, metrics] = await Promise.all([
    listAllProfiles(),
    getAdminMetrics(),
  ]);

  return NextResponse.json({ users, metrics });
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  const body = (await request.json()) as {
    userId?: string;
    role?: UserRole;
    stripe_subscription_status?: StripeSubscriptionStatus;
  };

  if (!body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const patch: {
    role?: UserRole;
    stripe_subscription_status?: StripeSubscriptionStatus;
  } = {};

  if (body.role) patch.role = body.role;
  if (body.stripe_subscription_status) {
    patch.stripe_subscription_status = body.stripe_subscription_status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const updated = await updateProfileById(body.userId, patch);
  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user: updated });
}
