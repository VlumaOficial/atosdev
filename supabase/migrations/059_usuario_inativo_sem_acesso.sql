-- ============================================================
-- ATOS — Migration 059: usuário DESATIVADO perde o acesso
-- ============================================================
-- Achado em 2026-10-09 (testes da tela Usuários, E2 do portal): "desativar"
-- só trocava um sinalizador (users.active) — a conta continuava entrando e
-- lendo os dados da empresa (técnico/atendente/gestor desativado seguia com
-- acesso). Correção na raiz: get_meu_role() e get_meu_tenant() (base de TODAS
-- as regras de acesso e funções) passam a tratar usuário inativo como "sem
-- perfil": papel 'nenhum' e empresa nula — o mesmo estado de quem não é da
-- equipe. O bloqueio vale na hora, mesmo com a sessão ainda aberta. A própria
-- linha do usuário continua legível, para o app avisar "acesso desativado" e
-- encerrar a sessão.
-- ============================================================

create or replace function public.get_meu_role()
returns text language sql security definer stable set search_path = public as $$
  select coalesce((select role from public.users where id = auth.uid() and coalesce(active, true)), 'nenhum');
$$;

create or replace function public.get_meu_tenant()
returns uuid language sql security definer stable set search_path = public as $$
  select tenant_id from public.users where id = auth.uid() and coalesce(active, true);
$$;
