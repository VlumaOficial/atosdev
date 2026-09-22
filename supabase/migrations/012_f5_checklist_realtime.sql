-- ============================================================
-- ATOS — Migration 012 (F5): Realtime no checklist da OS
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
--
-- Permite que o técnico veja a reabertura/alteração do checklist
-- sem precisar dar refresh na página.
-- ============================================================

alter table public.checklist_instances replica identity full;

alter publication supabase_realtime add table public.checklist_instances;
