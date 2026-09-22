-- ============================================================
-- ATOS — Migration 006 (F3): Relato de conclusão da OS
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
-- ============================================================

alter table public.orders
  add column if not exists completion_notes text;
