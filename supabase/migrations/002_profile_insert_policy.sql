-- Allow signed-in users to create their own profile row
-- (needed if the signup trigger missed them).
-- Run once in Supabase SQL Editor.

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);
