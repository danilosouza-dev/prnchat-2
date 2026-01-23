-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ==========================================
-- 1. KANBAN COLUMNS
-- ==========================================
create table public.kanban_columns (
  id text primary key, -- Changed from uuid to text to support local IDs
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  "order" integer not null default 0,
  color text,
  is_default boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ... (RLS policies remain same)

-- ==========================================
-- 2. LEADS (Kanban Cards)
-- ==========================================
create table public.leads (
  id text primary key, -- Changed from uuid to text (chat_id is used as ID)
  user_id uuid references auth.users(id) on delete cascade not null,
  chat_id text not null, -- The WhatsApp Chat ID (phone number)
  column_id text references public.kanban_columns(id) on delete set null, -- Changed from uuid to text
  "order" integer default 0,
  name text,
  phone text,
  photo_url text,
  unread_count integer default 0,
  last_message jsonb, -- Snapshot of the last message
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Ensure unique chat_id per user (one card per contact per user)
  unique(user_id, chat_id)
);

-- ... (RLS policies remain same)

-- ==========================================
-- 3. NOTES
-- ==========================================
create table public.notes (
  id text primary key, -- Changed from uuid to text
  user_id uuid references auth.users(id) on delete cascade not null,
  chat_id text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ...

-- ==========================================
-- 4. SCHEDULES
-- ==========================================
create table public.schedules (
  id text primary key, -- Changed from uuid to text
  user_id uuid references auth.users(id) on delete cascade not null,
  chat_id text not null,
  content text not null,
  scheduled_time timestamp with time zone not null,
  status text check (status in ('pending', 'completed', 'failed', 'cancelled', 'paused')) default 'pending',
  attachment_url text,
  media_type text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ...

-- ==========================================
-- 5. TAGS
-- ==========================================
create table public.tags (
  id text primary key, -- Changed from uuid to text
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  color text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.tags enable row level security;

create policy "Users can manage tags" on public.tags
  for all using (auth.uid() = user_id);


-- ==========================================
-- Realtime Setup
-- ==========================================
-- Enable replication for realtime features on specific tables
alter publication supabase_realtime add table public.kanban_columns;
alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.schedules;
