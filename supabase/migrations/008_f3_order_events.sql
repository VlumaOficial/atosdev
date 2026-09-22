-- ============================================================
-- ATOS — Migration 008 (F3): Rastreabilidade imutável da OS
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
--
-- Substitui a linha do tempo antiga (montada de campos fixos que se
-- sobrescreviam) por um registro imutável de todo evento da OS, com
-- autor. Ver src/lib/orderEvents.ts (helper registrarEvento()).
-- ============================================================

create table if not exists public.order_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  order_id    uuid not null references public.orders(id) on delete cascade,
  event_type  text not null,
  actor_id    uuid references public.users(id) on delete set null,
  actor_name  text,
  details     jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_order_events_tenant on public.order_events(tenant_id);
create index if not exists idx_order_events_order on public.order_events(order_id, created_at);

-- ============================================================
-- RLS — ORDER_EVENTS (imutável: sem update/delete)
-- ============================================================
alter table public.order_events enable row level security;

create policy "order_events_select"
  on public.order_events for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

create policy "order_events_insert"
  on public.order_events for insert
  with check (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
