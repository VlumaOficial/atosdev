-- ============================================================
-- ATOS — Migration 019 (F6): Assinatura obrigatória por OS
-- ============================================================
-- Sobrescreve, por OS, o padrão do tenant (tenants.require_signature_to_complete):
-- null = usa o padrão do tenant; true = força exigir nesta OS;
-- false = força não exigir nesta OS, mesmo com o padrão ligado.
-- ============================================================

alter table public.orders
  add column if not exists require_signature boolean;
