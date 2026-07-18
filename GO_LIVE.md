# Go Live — Supabase + Stripe Setup

This guide lists the exact SQL to run in Supabase and the Stripe dashboard steps required for production.

---

## 1. Environment variables

Copy `.env.example` to `.env.local` and fill in real values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

STRIPE_SECRET_KEY=sk_live_...   # or sk_test_... while developing
STRIPE_PRICE_ID=price_...          # required default (prefer GBP for UK)
STRIPE_PRICE_ID_GBP=price_...      # optional; falls back to STRIPE_PRICE_ID
STRIPE_PRICE_ID_USD=price_...      # optional USD monthly Price
STRIPE_PRICE_ID_EUR=price_...      # optional EUR monthly Price
STRIPE_WEBHOOK_SECRET=whsec_...

NEXT_PUBLIC_APP_URL=https://your-domain.com

# Resend (signup confirmation). FROM must use a verified Resend domain.
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=RithmGen <noreply@karoldigital.co.uk>
ADMIN_EMAIL=support@rithmgen.co.uk
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (server only) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
| `STRIPE_PRICE_ID` | Stripe → Products → default Premium monthly Price ID (GBP recommended) |
| `STRIPE_PRICE_ID_GBP` | Optional GBP Price (same product). Falls back to `STRIPE_PRICE_ID` |
| `STRIPE_PRICE_ID_USD` | Optional USD Price for US visitors |
| `STRIPE_PRICE_ID_EUR` | Optional EUR Price for eurozone visitors |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → endpoint signing secret |
| `NEXT_PUBLIC_APP_URL` | Your production origin (no trailing slash) |
| `RESEND_FROM_EMAIL` | Resend verified sender (keep karoldigital until rithmgen.co.uk is verified) |
| `ADMIN_EMAIL` | User-facing support + admin alerts (`support@rithmgen.co.uk`) |

---

## 2. Supabase SQL (run in SQL Editor)

Run the migration file `supabase/migrations/001_profiles.sql`, or paste this:

```sql
-- Roles
create type public.user_role as enum ('user', 'admin');

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.user_role not null default 'user',
  stripe_customer_id text unique,
  stripe_subscription_status text not null default 'none'
    check (
      stripe_subscription_status in (
        'active',
        'trialing',
        'canceled',
        'past_due',
        'none'
      )
    ),
  created_at timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);

create index if not exists profiles_subscription_status_idx
  on public.profiles (stripe_subscription_status);

alter table public.profiles enable row level security;

-- Own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins
create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can update all profiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Auto-create profile on signup (free trial clock starts at created_at)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, stripe_subscription_status)
  values (new.id, coalesce(new.email, ''), 'user', 'none');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

### Promote your first admin

After you create an account via `/auth/signup`:

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

### Listener identity + avatars

Also run `supabase/migrations/006_profile_identity.sql` (adds `full_name`, `avatar_url`, and the public `avatars` storage bucket). Required for signup name, Google profile photos, and Listener Lounge photo upload.

### Auth settings (Supabase Dashboard)

1. **Authentication → URL configuration**
   - Site URL: `https://your-domain.com` (or `http://localhost:3000` for local)
   - Redirect URLs (add every origin you use):
     - `http://localhost:3000/auth/callback`
     - `https://your-domain.com/auth/callback`
     - If you sometimes run on another port locally (e.g. `3001`), add that origin too.
2. **Authentication → Providers → Email**
   - Enable Email provider
   - Optionally disable “Confirm email” for faster local testing
3. **Authentication → Providers → Google**
   - Enable Google provider
   - Add your Google OAuth client ID and secret (Google Cloud Console → APIs & Services → Credentials)
   - Authorized redirect URI in Google must include:
     - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
   - In Supabase, the app callback is `/auth/callback` (handled server-side after Google returns to Supabase)

---

## 3. Stripe dashboard configuration

### A. Create the Premium product (multi-currency Prices)

The app picks a Stripe Price from the visitor’s country (Vercel `x-vercel-ip-country`, else Accept-Language, else GB). Amounts are loaded from Stripe — do **not** invent FX rates in the app.

**Country → currency**

| Markets | Currency | Env var |
|---|---|---|
| GB, Crown Dependencies | GBP (default) | `STRIPE_PRICE_ID` / `STRIPE_PRICE_ID_GBP` |
| US + US territories | USD | `STRIPE_PRICE_ID_USD` |
| Eurozone (+ AD, MC, SM, VA, XK, ME) | EUR | `STRIPE_PRICE_ID_EUR` |
| Everywhere else | GBP default | `STRIPE_PRICE_ID` |

1. Open [Stripe Dashboard](https://dashboard.stripe.com) → toggle **Test mode** ON (sandbox)
2. **Products** → **Add product**
3. Name: `80s Hit Radio Premium` (or RithmGen Premium)
4. Create a recurring **monthly** Price in **GBP** (recommended default for rithmgen.co.uk) — set the GBP amount you want to charge
5. Copy that **Price ID** (`price_...`) into `STRIPE_PRICE_ID` (and optionally `STRIPE_PRICE_ID_GBP`)
6. On the **same product**, add additional monthly Prices:
   - **USD** → `STRIPE_PRICE_ID_USD`
   - **EUR** → `STRIPE_PRICE_ID_EUR`
7. Set each Price to the amount you want in that currency (Stripe Dashboard / your pricing policy — not converted in code)
8. Mirror the same Price IDs in Vercel env for Production (and Preview if you test there)

If a market Price env is missing, checkout and the pricing page fall back to `STRIPE_PRICE_ID`.

**Optional — Adaptive Pricing:** In Stripe → Settings → Adaptive Pricing, you can enable automatic conversion for Checkout. That helps currencies beyond GBP/USD/EUR. This app still uses explicit Price IDs for GB/US/EU so the pricing page and Checkout charge the same Stripe Price. Adaptive Pricing is optional and does not replace the env Price IDs above.

### B. Customer portal

1. Stripe → **Settings → Billing → Customer portal**
2. Enable portal
3. Allow customers to cancel / update payment method
4. Save

### C. Webhooks — how to get `STRIPE_WEBHOOK_SECRET`

Your app listens at **`POST /api/stripe/webhook`**. Stripe must send events there and sign them with a secret starting with `whsec_`.

#### Option 1 — Local development (recommended first)

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli)
2. Log in: `stripe login`
3. In a separate terminal (while `npm run dev` is running):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

4. The CLI prints something like:

```text
Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

5. Put that value in `.env.local`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

6. Restart `npm run dev` so Next.js reloads env vars
7. Keep `stripe listen` running whenever you test checkout locally

Optional: trigger a fake event to verify the route:

```bash
stripe trigger checkout.session.completed
```

#### Option 2 — Production / deployed URL

1. Stripe → **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://YOUR_DOMAIN.com/api/stripe/webhook`
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Click **Add endpoint**
5. Open the endpoint → **Reveal** under **Signing secret**
6. Copy `whsec_...` into production env as `STRIPE_WEBHOOK_SECRET`

> Note: Local CLI (`stripe listen`) and production Dashboard endpoints each have **different** `whsec_` secrets. Use the CLI secret for localhost; use the Dashboard secret for your live/deployed site.

### D. What the webhook does in this app

When Stripe fires those events, `/api/stripe/webhook` updates `profiles.stripe_customer_id` and `profiles.stripe_subscription_status` in Supabase so the stream gate can unlock Premium users.

---

## 4. Streaming gate rules (server-enforced)

`GET /api/stream/check-status`:

| Condition | HTTP | Result |
|---|---|---|
| No Supabase session | **401** | Paywall → Sign in / Start Free Month |
| `account_age > 30 days` AND `stripe_subscription_status !== 'active'` | **403** | Paywall → Subscribe now |
| Otherwise | **200** | Streaming allowed |

The free month is measured from `profiles.created_at`. Stripe status is updated only by the webhook (and admin overrides).

---

## 5. Smoke-test checklist

1. Sign up at `/auth/signup` → profile row appears in `profiles`
2. Stream works during first 30 days without paying
3. Complete Checkout → webhook sets `stripe_subscription_status = 'active'`
4. In SQL, backdate a test user: `update profiles set created_at = now() - interval '45 days' where email = '...'` with status `none` → player locks + blur paywall
5. Admin email promoted → `/dashboard/admin` shows metrics + user table
6. “Manage Subscription” opens Stripe Customer Portal for active subscribers

---

## 6. Key app routes

| Route | Purpose |
|---|---|
| `/auth/signup`, `/auth/login` | Supabase email/password auth |
| `/auth/callback` | OAuth / magic-link code exchange |
| `/api/stream/check-status` | Subscription gate |
| `/api/stripe/pricing` | Localized Premium amount (country → Stripe Price) |
| `/api/stripe/checkout` | Create Checkout Session (matching Price) |
| `/api/stripe/portal` | Customer Portal session |
| `/api/stripe/webhook` | Sync subscription status → Postgres |
| `/dashboard/profile` | Listener Lounge — profile, trial, billing |
| `/dashboard/admin` | Admin metrics + role/status overrides |
| `/help` | Help & support (`support@rithmgen.co.uk`) |
| `/pricing` | Subscribe CTA |
