-- 80s Hit Radio — profiles + subscription schema
-- Run in the Supabase SQL editor or via CLI migrations.

create type public.user_role as enum ('user', 'admin');

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

-- Avoid RLS recursion when checking admin role
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create policy "Users can view own profile"
  on public.profiles for select
  using (
    auth.uid() = id
    or public.current_user_role() = 'admin'
  );

create policy "Users can update own profile"
  on public.profiles for update
  using (
    auth.uid() = id
    or public.current_user_role() = 'admin'
  )
  with check (
    auth.uid() = id
    or public.current_user_role() = 'admin'
  );

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup (1-month free trial starts at created_at)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, stripe_subscription_status)
  values (
    new.id,
    coalesce(new.email, ''),
    'user',
    'none'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
