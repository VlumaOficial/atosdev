-- ============================================================
-- ATOS — Migration 017 (F6 Bloco A): Assinatura digital
-- ============================================================
-- Assinatura do cliente na conclusão da OS, capturada por toque na
-- tela do técnico. Sem cadastro prévio de contato — nome digitado
-- na hora, mesmo padrão já decidido para o envio (WhatsApp/e-mail).
--
-- require_signature_to_complete é configurável por tenant (default
-- false = não trava ninguém hoje) via nova tela de Configurações.
-- ============================================================

alter table public.orders
  add column if not exists signature_path text,
  add column if not exists signer_name text,
  add column if not exists signed_at timestamptz;

alter table public.tenants
  add column if not exists require_signature_to_complete boolean not null default false;
