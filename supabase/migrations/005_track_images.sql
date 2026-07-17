-- Per-track artwork stored in the database (not external URLs).
-- Served by GET /api/track-images/[youtubeId]

create table if not exists public.track_images (
  youtube_id text primary key check (char_length(youtube_id) = 11),
  content_type text not null default 'image/jpeg',
  -- Base64-encoded image bytes (avoids brittle bytea encoding via PostgREST)
  data text not null,
  byte_size int not null check (byte_size > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists track_images_updated_at_idx
  on public.track_images (updated_at desc);

alter table public.track_images enable row level security;

-- Public read so the app API / anon client can load art when needed.
create policy "Anyone can read track images"
  on public.track_images for select
  using (true);

create policy "Admins manage track images"
  on public.track_images for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
