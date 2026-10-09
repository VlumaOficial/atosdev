-- ============================================================
-- ATOS — Migration 053: "sem perfil" nunca passa por "tem permissão"
-- ============================================================
-- Achado pelo roteiro automático de segurança da E1 do portal (2026-10-09):
-- ~35 funções protegem-se com "if get_meu_role() <> 'admin' then raise" ou
-- "not in (...)". Para quem NÃO tem linha em public.users (as pessoas do
-- portal, por desenho), get_meu_role() era NULL, a comparação dá NULL e o
-- IF não dispara: a guarda deixava passar. Ex.: uma pessoa do portal
-- poderia trocar a chave de geocodificação da plataforma, a identidade
-- legal de qualquer empresa ou habilitar o portal de qualquer empresa.
-- Correção na raiz: get_meu_role() devolve 'nenhum' para quem não tem
-- perfil interno. As regras de tabela (policies) já eram seguras (toda
-- comparação negativa vem junto com "tenant_id = get_meu_tenant()", que é
-- nulo para essas pessoas) e continuam iguais.
-- Junto: feriados da plataforma deixam de ser legíveis por visitante
-- anônimo e pessoas do portal (só usuários internos).
-- ============================================================

create or replace function public.get_meu_role()
returns text language sql security definer stable set search_path = public as $$
  select coalesce((select role from public.users where id = auth.uid()), 'nenhum');
$$;

drop policy if exists feriados_select on public.feriados;
create policy feriados_select on public.feriados for select
  using ((tenant_id is null and get_meu_tenant() is not null)
         or tenant_id = get_meu_tenant()
         or get_meu_role() = 'super_admin');
