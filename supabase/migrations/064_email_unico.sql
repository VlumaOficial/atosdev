-- 064 — um e-mail só existe uma vez na base (equipe interna OU portal), em qualquer caixa
-- Antes: só a unicidade do Auth (auth.users) protegia; as tabelas do app (users, portal_pessoas)
-- aceitavam repetido por escrita direta e nada impedia o mesmo e-mail nos dois lados.
create unique index if not exists users_email_unico on public.users (lower(email)) where email is not null;
create unique index if not exists portal_pessoas_email_unico on public.portal_pessoas (lower(email)) where email is not null;

create or replace function public.fn_email_interno_livre()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and exists (select 1 from public.portal_pessoas p where lower(p.email) = lower(new.email)) then
    raise exception 'Este e-mail já pertence a uma pessoa do portal de atendimento.' using errcode = '23505';
  end if;
  return new;
end $$;

create or replace function public.fn_email_portal_livre()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and exists (select 1 from public.users u where lower(u.email) = lower(new.email)) then
    raise exception 'Este e-mail pertence a um usuário da equipe interna e não pode ser usado no portal.' using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists trg_users_email_livre on public.users;
create trigger trg_users_email_livre before insert or update of email on public.users
  for each row execute function public.fn_email_interno_livre();
drop trigger if exists trg_portal_pessoas_email_livre on public.portal_pessoas;
create trigger trg_portal_pessoas_email_livre before insert or update of email on public.portal_pessoas
  for each row execute function public.fn_email_portal_livre();

revoke execute on function public.fn_email_interno_livre() from public, anon, authenticated;
revoke execute on function public.fn_email_portal_livre() from public, anon, authenticated;
