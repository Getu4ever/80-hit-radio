-- Catalog management + listening analytics for admin studio

create type public.listen_event_type as enum (
  'play_start',
  'play_complete',
  'skip',
  'session_start'
);

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  artist_id uuid references public.artists (id) on delete set null,
  year int not null check (year >= 1980 and year <= 1989),
  youtube_id text not null check (char_length(youtube_id) = 11),
  subgenre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title, artist, youtube_id)
);

create index if not exists tracks_subgenre_idx on public.tracks (subgenre);
create index if not exists tracks_artist_idx on public.tracks (artist);
create index if not exists tracks_artist_id_idx on public.tracks (artist_id);

create table if not exists public.listen_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  track_id uuid references public.tracks (id) on delete set null,
  event_type public.listen_event_type not null,
  duration_seconds int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists listen_events_created_at_idx
  on public.listen_events (created_at desc);
create index if not exists listen_events_track_id_idx
  on public.listen_events (track_id);
create index if not exists listen_events_event_type_idx
  on public.listen_events (event_type);

create table if not exists public.listener_presence (
  session_id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  last_seen_at timestamptz not null default now()
);

create index if not exists listener_presence_last_seen_idx
  on public.listener_presence (last_seen_at desc);

alter table public.artists enable row level security;
alter table public.tracks enable row level security;
alter table public.listen_events enable row level security;
alter table public.listener_presence enable row level security;

create policy "Anyone can read artists"
  on public.artists for select
  using (true);

create policy "Anyone can read tracks"
  on public.tracks for select
  using (true);

create policy "Admins manage artists"
  on public.artists for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "Admins manage tracks"
  on public.tracks for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "Anyone can insert listen events"
  on public.listen_events for insert
  with check (true);

create policy "Admins read listen events"
  on public.listen_events for select
  using (public.current_user_role() = 'admin');

create policy "Anyone can upsert listener presence"
  on public.listener_presence for insert
  with check (true);

create policy "Anyone can update listener presence"
  on public.listener_presence for update
  using (true)
  with check (true);

create policy "Admins read listener presence"
  on public.listener_presence for select
  using (public.current_user_role() = 'admin');

-- Public read bucket for artist portraits (create bucket in dashboard if needed)
insert into storage.buckets (id, name, public)
values ('artist-images', 'artist-images', true)
on conflict (id) do nothing;

create policy "Public read artist images"
  on storage.objects for select
  using (bucket_id = 'artist-images');

create policy "Admins upload artist images"
  on storage.objects for insert
  with check (
    bucket_id = 'artist-images'
    and public.current_user_role() = 'admin'
  );

create policy "Admins update artist images"
  on storage.objects for update
  using (
    bucket_id = 'artist-images'
    and public.current_user_role() = 'admin'
  );

create policy "Admins delete artist images"
  on storage.objects for delete
  using (
    bucket_id = 'artist-images'
    and public.current_user_role() = 'admin'
  );
