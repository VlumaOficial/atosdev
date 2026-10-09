-- ============================================================
-- ATOS — Migration 048: fecha a escalada de privilégio pelo cadastro público
-- ============================================================
-- Achado em 2026-10-09 (preparação da E1 do portal): o gatilho
-- handle_new_user copiava o PERFIL (role) dos metadados do usuário, que o
-- próprio usuário escolhe no cadastro público (supabase.auth.signUp com a
-- chave pública). Com o cadastro aberto no Auth, qualquer pessoa poderia
-- criar uma conta "super_admin". Correção em duas partes:
--   1. aqui: o perfil nasce sempre "tecnico" sem empresa (quem define perfil e
--      empresa é a função criar-tecnico, no servidor); e contas do PORTAL
--      (app_metadata.tipo = 'portal', só gravável pelo servidor) não viram
--      usuários internos — preparo da E1 do portal
--   2. no Auth (Management API): cadastro público desligado (disable_signup)
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  if coalesce(new.raw_app_meta_data->>'tipo', '') = 'portal' then
    return new;
  end if;
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'tecnico'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
