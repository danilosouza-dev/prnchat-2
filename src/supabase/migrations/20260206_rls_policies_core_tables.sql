-- PrinChat: ensure core tables have user-scoped RLS policies
-- Date: 2026-02-06

begin;

do $$
declare
  tbl text;
  policy_name text;
begin
  foreach tbl in array array[
    'scripts',
    'signatures',
    'triggers',
    'tags',
    'kanban_columns',
    'leads',
    'notes',
    'schedules'
  ]
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = tbl
    ) then
      execute format('alter table public.%I enable row level security', tbl);

      policy_name := format('Users can manage own %s', tbl);
      if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = tbl
          and policyname = policy_name
      ) then
        execute format(
          'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
          policy_name,
          tbl
        );
      end if;
    end if;
  end loop;
end $$;

commit;
