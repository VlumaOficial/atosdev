-- ============================================================
-- ATOS — Migration 018 (F6): RPC segura p/ Admin editar config do tenant
-- ============================================================
-- Achado testando: a policy tenants_super_admin_all (ALL) só cobre
-- super_admin; admin do tenant só tem SELECT (tenants_member_select).
-- Um UPDATE direto de admin em public.tenants afeta 0 linhas (RLS
-- filtra silenciosamente, sem erro) — Configurações parecia salvar
-- mas não gravava nada.
--
-- Em vez de abrir uma policy de UPDATE completa pra admin (deixaria
-- editar plan/status, que são campos comerciais só de super_admin),
-- uma função SECURITY DEFINER expõe só o que o admin pode mesmo
-- mudar. Padrão já usado no projeto (gerar_numero_os,
-- criar_unidade_principal).
-- ============================================================

create or replace function public.atualizar_config_tenant(p_require_signature boolean)
returns void as $$
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then
    raise exception 'Sem permissão para alterar configurações do tenant';
  end if;

  update public.tenants
  set require_signature_to_complete = p_require_signature
  where id = public.get_meu_tenant();
end;
$$ language plpgsql security definer;
