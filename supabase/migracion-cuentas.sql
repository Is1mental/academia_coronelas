-- Migración: cuentas creadas por el superadministrador con cambio obligatorio de contraseña.
-- Ejecutar en Supabase > SQL Editor (proyectos que ya tienen schema.sql aplicado).
alter table public.user_roles add column if not exists must_change_password boolean not null default false;

-- Mientras la cuenta deba cambiar su contraseña, no tiene ningún permiso (RLS la trata como "pending").
create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select case when must_change_password then 'pending' else role end from public.user_roles where user_id = auth.uid()), 'pending')
$$;

create or replace function public.mark_password_changed() returns void
language sql security definer set search_path = public as $$
  update public.user_roles set must_change_password = false where user_id = auth.uid();
$$;
revoke all on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;

drop function if exists public.admin_list_accounts();
create or replace function public.admin_list_accounts()
returns table (id uuid, email text, role text, must_change boolean) language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'No tienes permiso para administrar cuentas.'; end if;
  return query select u.id, u.email::text, coalesce(r.role, 'pending'), coalesce(r.must_change_password, false)
    from auth.users u left join public.user_roles r on r.user_id = u.id order by u.created_at;
end $$;
revoke all on function public.admin_list_accounts() from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;
