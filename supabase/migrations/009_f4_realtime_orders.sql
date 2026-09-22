-- ============================================================
-- ATOS — Migration 009 (F4): Realtime na OS (app de campo)
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
--
-- Permite que a lista/detalhe do técnico (useMyOrders, useOrder)
-- atualizem sem refresh quando o admin cria/altera uma OS.
-- REPLICA IDENTITY FULL é obrigatório para o payload do Realtime
-- trazer o registro completo em updates/deletes.
-- ============================================================

alter table public.orders replica identity full;

alter publication supabase_realtime add table public.orders;
