"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Profile,
  StripeSubscriptionStatus,
  UserRole,
} from "@/types/database.types";

type Metrics = {
  totalUsers: number;
  activeSubscribers: number;
  trialingUsers: number;
  canceledUsers: number;
  pastDueUsers: number;
  adminUsers: number;
  newThisWeek: number;
  conversionRate: number;
};

type StatusFilter = "all" | StripeSubscriptionStatus;
type RoleFilter = "all" | UserRole;

const STATUS_OPTIONS: StripeSubscriptionStatus[] = [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
];

const ROLE_OPTIONS: UserRole[] = ["user", "admin"];

function statusTone(status: StripeSubscriptionStatus): string {
  switch (status) {
    case "active":
      return "text-cyan-300";
    case "trialing":
      return "text-fuchsia-300";
    case "past_due":
      return "text-amber-300";
    case "canceled":
      return "text-white/45";
    default:
      return "text-white/55";
  }
}

export default function AdminListeners() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) {
        setError(res.status === 403 ? "Admin access required" : "Failed to load");
        return;
      }
      const data = (await res.json()) as { users: Profile[]; metrics: Metrics };
      setUsers(data.users);
      setMetrics(data.metrics);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateUser(
    userId: string,
    patch: {
      role?: UserRole;
      stripe_subscription_status?: StripeSubscriptionStatus;
    },
  ) {
    setSavingId(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...patch }),
      });
      if (!res.ok) {
        setError("Update failed");
        return;
      }
      const data = (await res.json()) as { user: Profile };
      const nextUsers = users.map((u) =>
        u.id === data.user.id ? data.user : u,
      );
      setUsers(nextUsers);

      const activeSubscribers = nextUsers.filter(
        (p) => p.stripe_subscription_status === "active",
      ).length;
      setMetrics((prevMetrics) =>
        prevMetrics
          ? {
              ...prevMetrics,
              activeSubscribers,
              conversionRate:
                nextUsers.length === 0
                  ? 0
                  : Math.round((activeSubscribers / nextUsers.length) * 100),
              adminUsers: nextUsers.filter((p) => p.role === "admin").length,
              canceledUsers: nextUsers.filter(
                (p) => p.stripe_subscription_status === "canceled",
              ).length,
              pastDueUsers: nextUsers.filter(
                (p) => p.stripe_subscription_status === "past_due",
              ).length,
            }
          : prevMetrics,
      );
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter !== "all" && user.stripe_subscription_status !== statusFilter) {
        return false;
      }
      if (roleFilter !== "all" && user.role !== roleFilter) {
        return false;
      }
      if (!q) return true;
      return (
        user.email.toLowerCase().includes(q) ||
        (user.full_name?.toLowerCase().includes(q) ?? false) ||
        user.id.toLowerCase().includes(q)
      );
    });
  }, [users, query, statusFilter, roleFilter]);

  const selected = users.find((u) => u.id === selectedId) ?? filtered[0] ?? null;

  if (loading) {
    return <p className="text-sm text-white/50">Loading listener roster…</p>;
  }

  if (error && users.length === 0) {
    return <p className="text-sm text-fuchsia-300">{error}</p>;
  }

  return (
    <div className="space-y-8">
      {metrics && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total accounts", value: metrics.totalUsers, hint: "All profiles" },
            {
              label: "Premium live",
              value: metrics.activeSubscribers,
              hint: `${metrics.conversionRate}% conversion`,
            },
            {
              label: "Free trial",
              value: metrics.trialingUsers,
              hint: "Within 14-day window",
            },
            {
              label: "New this week",
              value: metrics.newThisWeek,
              hint: `${metrics.adminUsers} admins · ${metrics.canceledUsers} canceled`,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <p className="text-xs uppercase tracking-widest text-white/40">
                {stat.label}
              </p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-white/35">{stat.hint}</p>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-400/70">
          Member selected
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
          Access levers
        </h2>

        {selected ? (
          <div className="mt-5 space-y-4">
            <div>
              <p className="truncate text-lg text-white">{selected.email}</p>
              <p className="mt-1 text-xs text-white/35">
                Joined{" "}
                {new Date(selected.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}{" "}
                · ID {selected.id.slice(0, 8)}…
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={savingId === selected.id}
                onClick={() =>
                  void updateUser(selected.id, {
                    stripe_subscription_status: "active",
                  })
                }
                className="rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
              >
                Grant Premium
              </button>
              <button
                type="button"
                disabled={savingId === selected.id}
                onClick={() =>
                  void updateUser(selected.id, {
                    stripe_subscription_status: "canceled",
                  })
                }
                className="rounded-xl border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-fuchsia-200 transition hover:bg-fuchsia-500/20 disabled:opacity-50"
              >
                Revoke access
              </button>
              <button
                type="button"
                disabled={savingId === selected.id}
                onClick={() =>
                  void updateUser(selected.id, {
                    stripe_subscription_status: "none",
                  })
                }
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/65 transition hover:bg-white/10 disabled:opacity-50"
              >
                Reset to trial base
              </button>
              <button
                type="button"
                disabled={savingId === selected.id}
                onClick={() =>
                  void updateUser(selected.id, {
                    role: selected.role === "admin" ? "user" : "admin",
                  })
                }
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/65 transition hover:bg-white/10 disabled:opacity-50"
              >
                {selected.role === "admin" ? "Demote staff" : "Make admin"}
              </button>
            </div>

            <p className={`text-sm ${statusTone(selected.stripe_subscription_status)}`}>
              Current: {selected.role} · {selected.stripe_subscription_status}
              {savingId === selected.id ? " · Saving…" : ""}
            </p>
          </div>
        ) : (
          <p className="mt-5 text-sm text-white/45">
            Select a listener from the roster to manage access.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Listener roster
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
              Control every account
            </h2>
          </div>
          <p className="text-xs text-white/35">
            Showing {filtered.length} of {users.length}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email or id…"
            className="min-w-[12rem] flex-1 rounded-xl border border-white/10 bg-[#0a0614] px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/40 focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-xl border border-white/10 bg-[#0a0614] px-3 py-2.5 text-sm text-white"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="rounded-xl border border-white/10 bg-[#0a0614] px-3 py-2.5 text-sm text-white"
          >
            <option value="all">All roles</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-fuchsia-300">{error}</p>}

        <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-widest text-white/40">
              <tr>
                <th className="px-4 py-3 font-medium">Listener</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Subscription</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const active = (selectedId ?? selected?.id) === user.id;
                return (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedId(user.id)}
                    className={`cursor-pointer border-b border-white/5 last:border-0 ${
                      active
                        ? "bg-cyan-400/10 text-white"
                        : "text-white/80 hover:bg-white/[0.04]"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-white/90">
                        {user.full_name?.trim() || user.email.split("@")[0]}
                      </p>
                      <p className="text-white/45">{user.email}</p>
                      <p className="text-[11px] text-white/30">
                        {user.stripe_customer_id
                          ? `Stripe · ${user.stripe_customer_id.slice(0, 14)}…`
                          : "No Stripe customer"}
                      </p>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={user.role}
                        disabled={savingId === user.id}
                        onChange={(e) =>
                          void updateUser(user.id, {
                            role: e.target.value as UserRole,
                          })
                        }
                        className="rounded-lg border border-white/10 bg-[#0a0614] px-2 py-1.5 text-xs text-white"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={user.stripe_subscription_status}
                        disabled={savingId === user.id}
                        onChange={(e) =>
                          void updateUser(user.id, {
                            stripe_subscription_status: e.target
                              .value as StripeSubscriptionStatus,
                          })
                        }
                        className={`rounded-lg border border-white/10 bg-[#0a0614] px-2 py-1.5 text-xs ${statusTone(user.stripe_subscription_status)}`}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-white/45">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-white/40"
                  >
                    No listeners match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
