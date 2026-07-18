-- Listener identity: display name + avatar (Google or uploaded)

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text;

comment on column public.profiles.full_name is 'Listener display name from signup or Google';
comment on column public.profiles.avatar_url is 'Profile picture URL (Google or Supabase Storage)';

-- Pull name/avatar from auth metadata on signup (email + Google OAuth)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_name text;
  meta_avatar text;
begin
  meta_name := nullif(
    trim(
      coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'display_name',
        ''
      )
    ),
    ''
  );
  meta_avatar := nullif(
    trim(
      coalesce(
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'picture',
        ''
      )
    ),
    ''
  );

  insert into public.profiles (
    id,
    email,
    role,
    stripe_subscription_status,
    full_name,
    avatar_url
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'user',
    'none',
    meta_name,
    meta_avatar
  );
  return new;
end;
$$;

-- Public avatars bucket (users write only to their own folder)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
