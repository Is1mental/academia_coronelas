-- Academia Elite · Coronelas de Durango
-- Ejecutar completo en Supabase > SQL Editor (una sola vez).
-- Modelo de permisos basado en el panel de coronelas-propuesta-hq:
--   super_admin  administra cuentas y todo el contenido
--   admin        publica, edita y elimina
--   editor       publica y edita, sin eliminar
--   viewer       solo consulta el panel
--   pending      cuenta nueva sin permisos (no ve contenido interno)
-- La PRIMERA cuenta que se registre queda como super_admin; las demás, pendientes.

-- ───────── Roles ─────────
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'pending' check (role in ('super_admin','admin','editor','viewer','pending')),
  created_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.user_roles where user_id = auth.uid()), 'pending')
$$;
create or replace function public.can_view()  returns boolean language sql stable security definer set search_path = public as $$ select public.current_role_name() in ('super_admin','admin','editor','viewer') $$;
create or replace function public.can_edit()  returns boolean language sql stable security definer set search_path = public as $$ select public.current_role_name() in ('super_admin','admin','editor') $$;
create or replace function public.can_admin() returns boolean language sql stable security definer set search_path = public as $$ select public.current_role_name() in ('super_admin','admin') $$;
create or replace function public.is_super()  returns boolean language sql stable security definer set search_path = public as $$ select public.current_role_name() = 'super_admin' $$;

create policy roles_read_own on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, case when exists (select 1 from public.user_roles where role = 'super_admin') then 'pending' else 'super_admin' end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Gestión de cuentas (solo superadministrador)
create or replace function public.admin_list_accounts()
returns table (id uuid, email text, role text) language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'No tienes permiso para administrar cuentas.'; end if;
  return query select u.id, u.email::text, coalesce(r.role, 'pending') from auth.users u left join public.user_roles r on r.user_id = u.id order by u.created_at;
end $$;
create or replace function public.admin_set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'No tienes permiso para administrar cuentas.'; end if;
  if new_role not in ('admin','editor','viewer','pending') then raise exception 'Permiso no válido.'; end if;
  if exists (select 1 from public.user_roles where user_id = target and role = 'super_admin') then raise exception 'La cuenta superadministradora está protegida.'; end if;
  insert into public.user_roles (user_id, role) values (target, new_role)
  on conflict (user_id) do update set role = excluded.role;
end $$;
revoke all on function public.admin_list_accounts() from public, anon;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.current_role_name(), public.can_view(), public.can_edit(), public.can_admin(), public.is_super() to anon, authenticated;

-- ───────── Contenido ─────────
create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  age text not null default '',
  description text not null default '' check (char_length(description) <= 400),
  featured boolean not null default false,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 80),
  days text not null default '',
  time text not null default '',
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  role text not null default '',
  bio text not null default '' check (char_length(bio) <= 1500),
  photo_url text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  caption text not null default '' check (char_length(caption) <= 200),
  album text not null default '',
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 1 and 200),
  answer text not null default '' check (char_length(answer) <= 2000),
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  content text not null default '' check (char_length(content) <= 100000),
  hero_image_url text,
  status text not null default 'draft' check (status in ('draft','published')),
  show_in_menu boolean not null default false,
  show_in_footer boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 120),
  age integer check (age between 3 and 30),
  category text not null default '' check (char_length(category) <= 80),
  guardian text not null check (char_length(guardian) between 1 and 120),
  player_first text not null default '' check (char_length(player_first) <= 40),
  player_paternal text not null default '' check (char_length(player_paternal) <= 40),
  player_maternal text not null default '' check (char_length(player_maternal) <= 40),
  guardian_first text not null default '' check (char_length(guardian_first) <= 40),
  guardian_paternal text not null default '' check (char_length(guardian_paternal) <= 40),
  guardian_maternal text not null default '' check (char_length(guardian_maternal) <= 40),
  phone text not null check (char_length(phone) between 7 and 30),
  status text not null default 'new' check (status in ('new','contacted','enrolled','discarded')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ───────── RLS ─────────
do $$
declare t text;
begin
  -- Tablas con visibilidad pública por "active"
  foreach t in array array['categories','schedules','coaches','photos','faqs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to anon using (active)', t||'_public', t);
    execute format('create policy %I on public.%I for select to authenticated using (active or public.can_view())', t||'_auth_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit())', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit()) with check (public.can_edit())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_admin())', t||'_del', t);
  end loop;
end $$;

-- settings: lectura pública (no guardar secretos aquí), escritura editores
alter table public.settings enable row level security;
grant select on public.settings to anon;
grant select, insert, update, delete on public.settings to authenticated;
create policy settings_read on public.settings for select to anon, authenticated using (true);
create policy settings_ins on public.settings for insert to authenticated with check (public.can_edit());
create policy settings_upd on public.settings for update to authenticated using (public.can_edit()) with check (public.can_edit());

-- pages: público solo publicadas
alter table public.pages enable row level security;
grant select on public.pages to anon;
grant select, insert, update, delete on public.pages to authenticated;
create policy pages_public on public.pages for select to anon using (status = 'published');
create policy pages_auth_read on public.pages for select to authenticated using (status = 'published' or public.can_view());
create policy pages_ins on public.pages for insert to authenticated with check (public.can_edit());
create policy pages_upd on public.pages for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy pages_del on public.pages for delete to authenticated using (public.can_admin());

-- enrollments: cualquiera puede enviar; solo personal lo lee
alter table public.enrollments enable row level security;
grant insert on public.enrollments to anon;
grant select, insert, update, delete on public.enrollments to authenticated;
create policy enroll_insert on public.enrollments for insert to anon, authenticated with check (status = 'new' and notes = '');
create policy enroll_read on public.enrollments for select to authenticated using (public.can_view());
create policy enroll_upd on public.enrollments for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy enroll_del on public.enrollments for delete to authenticated using (public.can_admin());

-- ───────── Almacenamiento de fotografías ─────────
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
create policy media_read on storage.objects for select using (bucket_id = 'media');
create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_edit() and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','avif'));
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.can_edit());
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.can_admin());

-- Migración: apellidos separados en solicitudes (para proyectos ya creados)
alter table public.enrollments add column if not exists player_first text not null default '' check (char_length(player_first) <= 40);
alter table public.enrollments add column if not exists player_paternal text not null default '' check (char_length(player_paternal) <= 40);
alter table public.enrollments add column if not exists player_maternal text not null default '' check (char_length(player_maternal) <= 40);
alter table public.enrollments add column if not exists guardian_first text not null default '' check (char_length(guardian_first) <= 40);
alter table public.enrollments add column if not exists guardian_paternal text not null default '' check (char_length(guardian_paternal) <= 40);
alter table public.enrollments add column if not exists guardian_maternal text not null default '' check (char_length(guardian_maternal) <= 40);
