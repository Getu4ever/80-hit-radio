-- Fix infinite recursion in profiles RLS policies.
-- Run this in the Supabase SQL Editor.

-- Helper: read role without triggering RLS (security definer).
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

-- Drop recursive policies
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

-- Recreate non-recursive policies
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
