-- PrinChat: scope data by WhatsApp instance + enforce single active extension session per account
-- Date: 2026-02-06

begin;

-- ==========================================
-- 1) Scoped data columns (kanban/notes/schedules)
-- ==========================================

alter table if exists public.kanban_columns
  add column if not exists whatsapp_instance_id text;

alter table if exists public.leads
  add column if not exists whatsapp_instance_id text;

alter table if exists public.notes
  add column if not exists whatsapp_instance_id text;

alter table if exists public.schedules
  add column if not exists whatsapp_instance_id text;

update public.kanban_columns
set whatsapp_instance_id = 'legacy_unassigned'
where whatsapp_instance_id is null;

update public.leads
set whatsapp_instance_id = 'legacy_unassigned'
where whatsapp_instance_id is null;

update public.notes
set whatsapp_instance_id = 'legacy_unassigned'
where whatsapp_instance_id is null;

update public.schedules
set whatsapp_instance_id = 'legacy_unassigned'
where whatsapp_instance_id is null;

alter table if exists public.kanban_columns
  alter column whatsapp_instance_id set default 'legacy_unassigned';

alter table if exists public.leads
  alter column whatsapp_instance_id set default 'legacy_unassigned';

alter table if exists public.notes
  alter column whatsapp_instance_id set default 'legacy_unassigned';

alter table if exists public.schedules
  alter column whatsapp_instance_id set default 'legacy_unassigned';

create index if not exists idx_kanban_columns_user_instance
  on public.kanban_columns(user_id, whatsapp_instance_id);

create index if not exists idx_leads_user_instance_chat
  on public.leads(user_id, whatsapp_instance_id, chat_id);

create index if not exists idx_notes_user_instance_chat
  on public.notes(user_id, whatsapp_instance_id, chat_id);

create index if not exists idx_schedules_user_instance_chat
  on public.schedules(user_id, whatsapp_instance_id, chat_id);

-- Drop legacy uniqueness (user_id, chat_id) if present and replace with scoped uniqueness.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'leads_user_id_chat_id_key'
  ) then
    alter table public.leads drop constraint leads_user_id_chat_id_key;
  end if;
end $$;

alter table if exists public.leads
  add constraint leads_user_instance_chat_key unique (user_id, whatsapp_instance_id, chat_id);

-- ==========================================
-- 2) Single active extension session per account
-- ==========================================

create table if not exists public.account_active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id text not null,
  device_id text not null,
  whatsapp_instance_id text,
  heartbeat_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.account_active_sessions enable row level security;

-- Owner can read/update own active session row.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'account_active_sessions'
      and policyname = 'Users can read own active session'
  ) then
    create policy "Users can read own active session"
      on public.account_active_sessions
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'account_active_sessions'
      and policyname = 'Users can upsert own active session'
  ) then
    create policy "Users can upsert own active session"
      on public.account_active_sessions
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'account_active_sessions'
  ) then
    alter publication supabase_realtime add table public.account_active_sessions;
  end if;
end $$;

commit;
