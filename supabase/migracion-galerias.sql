-- Galerías (álbumes) de fotos y videos: entrenamientos por grupo, torneos, eventos.
create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  kind text not null default 'entrenamiento' check (kind in ('entrenamiento','torneo','evento','otro')),
  group_name text not null default '' check (char_length(group_name) <= 80),
  event_date date,
  description text not null default '' check (char_length(description) <= 600),
  cover_url text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  kind text not null default 'photo' check (kind in ('photo','video','embed')),
  url text not null check (char_length(url) <= 1000),
  caption text not null default '' check (char_length(caption) <= 200),
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists media_album_idx on public.media (album_id);

alter table public.albums enable row level security;
alter table public.media enable row level security;
grant select on public.albums, public.media to anon;
grant select, insert, update, delete on public.albums, public.media to authenticated;

drop policy if exists albums_public on public.albums;
drop policy if exists albums_auth_read on public.albums;
drop policy if exists albums_ins on public.albums;
drop policy if exists albums_upd on public.albums;
drop policy if exists albums_del on public.albums;
create policy albums_public on public.albums for select to anon using (active);
create policy albums_auth_read on public.albums for select to authenticated using (active or public.can_view());
create policy albums_ins on public.albums for insert to authenticated with check (public.can_edit());
create policy albums_upd on public.albums for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy albums_del on public.albums for delete to authenticated using (public.can_admin());

drop policy if exists media_public on public.media;
drop policy if exists media_auth_read on public.media;
drop policy if exists media_ins on public.media;
drop policy if exists media_upd on public.media;
drop policy if exists media_del on public.media;
create policy media_public on public.media for select to anon
  using (active and exists (select 1 from public.albums a where a.id = album_id and a.active));
create policy media_auth_read on public.media for select to authenticated using (active or public.can_view());
create policy media_ins on public.media for insert to authenticated with check (public.can_edit());
create policy media_upd on public.media for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy media_del on public.media for delete to authenticated using (public.can_admin());

-- Almacenamiento: además de imágenes, permite videos mp4/webm.
drop policy if exists media_upload on storage.objects;
create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_edit() and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','avif','mp4','webm'));

-- Las fotos de la galería anterior pasan a un álbum "Galería general" (la tabla photos no se borra).
do $$
declare a uuid;
begin
  if exists (select 1 from public.photos) and not exists (select 1 from public.albums) then
    insert into public.albums (title, kind) values ('Galería general', 'otro') returning id into a;
    insert into public.media (album_id, kind, url, caption, display_order, active)
      select a, 'photo', url, caption, display_order, active from public.photos;
  end if;
end $$;
