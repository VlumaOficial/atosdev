-- ============================================================
-- ATOS — Migration 052: conta do portal nunca fica como usuário interno
-- ============================================================
-- Achado no teste da E1 (2026-10-09): o Auth grava o app_metadata
-- ("tipo": "portal") num UPDATE logo depois do INSERT, então o gatilho de
-- INSERT (048) ainda não o vê e cria a linha em public.users. Este gatilho
-- remove essa linha assim que a conta é marcada como do portal — só se for
-- uma linha "órfã" (sem empresa), nunca um usuário interno de verdade.
-- ============================================================

create or replace function public.fn_auth_usuario_portal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_app_meta_data->>'tipo', '') = 'portal' then
    delete from public.users where id = new.id and tenant_id is null and role = 'tecnico';
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_portal on auth.users;
create trigger on_auth_user_portal after update of raw_app_meta_data on auth.users
  for each row execute function public.fn_auth_usuario_portal();

-- contas do portal já criadas
delete from public.users u using auth.users a
 where a.id = u.id and a.raw_app_meta_data->>'tipo' = 'portal' and u.tenant_id is null and u.role = 'tecnico';
