-- ============================================================
-- ATOS — Migration 050: funções internas fora do alcance dos usuários
-- ============================================================
-- Varredura de 2026-10-09 (antes da E1 do portal): funções SECURITY
-- DEFINER sem checagem de empresa/papel que só deveriam ser chamadas por
-- dentro do banco (gatilhos e outras funções) estavam executáveis por
-- qualquer usuário logado:
--   sla_politica_para       — devolvia a política de SLA de QUALQUER empresa
--   fn_motivos_pausa_padrao — semeava motivos de pausa em QUALQUER empresa
--   fn_os_tempos_uteis      — cálculo interno do painel (046)
-- Continuam funcionando para quem as usa por dentro (gatilhos, previa_sla,
-- painel_gerencial — todas rodam como dono).
-- ============================================================

revoke execute on function public.sla_politica_para(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fn_motivos_pausa_padrao(uuid) from public, anon, authenticated;
revoke execute on function public.fn_os_tempos_uteis(public.orders) from public, anon, authenticated;
