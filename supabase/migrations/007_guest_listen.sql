-- Server-side guest listen quota (1 hour per IP / device).
-- IP is stored only as a SHA-256 hash. Service role writes; no anon/auth policies.
--
-- Limitation (documented): a guest who changes IP (VPN, mobile network) and clears
-- the device cookie can obtain another free hour. IP+cookie is the practical lock
-- without requiring an account.

create table if not exists public.guest_listen (
  ip_hash text primary key,
  device_id text,
  seconds_listened int not null default 0
    check (seconds_listened >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guest_listen_device_id_uidx
  on public.guest_listen (device_id)
  where device_id is not null;

create index if not exists guest_listen_updated_at_idx
  on public.guest_listen (updated_at desc);

alter table public.guest_listen enable row level security;

-- Intentionally no RLS policies: anon/authenticated cannot read or write.
-- The Next.js server uses the service-role key (bypasses RLS).

comment on table public.guest_listen is
  'Guest free-listen budget keyed by hashed client IP (primary) and optional device cookie. VPN/new IP can bypass.';
