-- Track lounge: short comments + reactions scoped to the catalog track currently on air.

create table if not exists public.track_lounge_messages (
  id uuid primary key default gen_random_uuid(),
  catalog_track_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  body text not null check (char_length(body) > 0 and char_length(body) <= 140),
  created_at timestamptz not null default now()
);

create index if not exists track_lounge_messages_track_created_idx
  on public.track_lounge_messages (catalog_track_id, created_at desc);

create index if not exists track_lounge_messages_user_created_idx
  on public.track_lounge_messages (user_id, created_at desc);

create table if not exists public.track_lounge_reactions (
  catalog_track_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '🕺', '💜', '✨', '🙌')),
  created_at timestamptz not null default now(),
  primary key (catalog_track_id, user_id, emoji)
);

create index if not exists track_lounge_reactions_track_idx
  on public.track_lounge_reactions (catalog_track_id);

alter table public.track_lounge_messages enable row level security;
alter table public.track_lounge_reactions enable row level security;

-- Idempotent policies (safe to re-run this migration)
drop policy if exists "Anyone can read lounge messages" on public.track_lounge_messages;
drop policy if exists "Anyone can read lounge reactions" on public.track_lounge_reactions;
drop policy if exists "Members insert own lounge messages" on public.track_lounge_messages;
drop policy if exists "Members delete own lounge messages" on public.track_lounge_messages;
drop policy if exists "Members upsert own lounge reactions" on public.track_lounge_reactions;
drop policy if exists "Members delete own lounge reactions" on public.track_lounge_reactions;
drop policy if exists "Admins manage lounge messages" on public.track_lounge_messages;
drop policy if exists "Admins manage lounge reactions" on public.track_lounge_reactions;

-- Public read (guests can follow the vibe)
create policy "Anyone can read lounge messages"
  on public.track_lounge_messages for select
  using (true);

create policy "Anyone can read lounge reactions"
  on public.track_lounge_reactions for select
  using (true);

-- Authenticated members manage their own posts/reactions
create policy "Members insert own lounge messages"
  on public.track_lounge_messages for insert
  with check (auth.uid() = user_id);

create policy "Members delete own lounge messages"
  on public.track_lounge_messages for delete
  using (auth.uid() = user_id);

create policy "Members upsert own lounge reactions"
  on public.track_lounge_reactions for insert
  with check (auth.uid() = user_id);

create policy "Members delete own lounge reactions"
  on public.track_lounge_reactions for delete
  using (auth.uid() = user_id);

create policy "Admins manage lounge messages"
  on public.track_lounge_messages for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "Admins manage lounge reactions"
  on public.track_lounge_reactions for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
