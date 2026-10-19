-- Aviso por WhatsApp de cada solicitud nueva (requiere la función notify-enrollment desplegada).
alter table public.enrollments add column if not exists notified_at timestamptz;

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_enrollment() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://posoahjcolxtqltazwav.supabase.co/functions/v1/notify-enrollment',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('id', new.id)
  );
  return new;
exception when others then
  return new; -- nunca bloquea el envío del formulario
end $$;

drop trigger if exists enrollments_notify on public.enrollments;
create trigger enrollments_notify after insert on public.enrollments
for each row execute function public.notify_enrollment();
