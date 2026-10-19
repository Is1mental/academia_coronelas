-- Avisos y comunicados + contactos de padres de familia + interruptor de la sección.
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  summary text not null default '' check (char_length(summary) <= 300),
  content text not null default '' check (char_length(content) <= 100000),
  audience text not null default '' check (char_length(audience) <= 80),
  status text not null default 'draft' check (status in ('draft','published')),
  pinned boolean not null default false,
  publish_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null check (char_length(parent_name) between 1 and 120),
  player_name text not null default '' check (char_length(player_name) <= 120),
  phone text not null default '' check (char_length(phone) <= 30),
  email text not null default '' check (char_length(email) <= 160),
  group_name text not null default '' check (char_length(group_name) <= 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ¿La sección pública de avisos está activada? (sin configuración = activada)
create or replace function public.notices_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'notices')::boolean from public.settings where key = 'features'), true)
$$;
grant execute on function public.notices_enabled() to anon, authenticated;

alter table public.notices enable row level security;
alter table public.contacts enable row level security;
grant select on public.notices to anon;
grant select, insert, update, delete on public.notices, public.contacts to authenticated;

drop policy if exists notices_public on public.notices;
drop policy if exists notices_auth_read on public.notices;
drop policy if exists notices_ins on public.notices;
drop policy if exists notices_upd on public.notices;
drop policy if exists notices_del on public.notices;
create policy notices_public on public.notices for select to anon using (status = 'published' and public.notices_enabled());
create policy notices_auth_read on public.notices for select to authenticated
  using ((status = 'published' and public.notices_enabled()) or public.can_view());
create policy notices_ins on public.notices for insert to authenticated with check (public.can_edit());
create policy notices_upd on public.notices for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy notices_del on public.notices for delete to authenticated using (public.can_admin());

-- Datos personales de padres: solo administradores.
drop policy if exists contacts_all on public.contacts;
create policy contacts_all on public.contacts for all to authenticated using (public.can_admin()) with check (public.can_admin());

-- El interruptor ("features") solo lo cambian superadministrador y administrador.
drop policy if exists settings_ins on public.settings;
drop policy if exists settings_upd on public.settings;
create policy settings_ins on public.settings for insert to authenticated
  with check (public.can_edit() and (key <> 'features' or public.can_admin()));
create policy settings_upd on public.settings for update to authenticated
  using (public.can_edit() and (key <> 'features' or public.can_admin()))
  with check (public.can_edit() and (key <> 'features' or public.can_admin()));
