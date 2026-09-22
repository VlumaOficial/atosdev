-- ============================================================
-- ATOS — Migration 022 (F6): Evidências fotográficas da OS
-- ============================================================
-- Campo de evidências independente de checklist — algumas OS não têm
-- checklist associado e ainda assim precisam de evidência fotográfica
-- (achado testando: OS sem checklist não tinha onde anexar foto).
-- Mesmo padrão de order_comments (tenant-scoped, autor capturado).
-- ============================================================

create table if not exists public.order_evidences (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  order_id    uuid not null references public.orders(id) on delete cascade,
  file_path   text not null,
  observacao  text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_order_evidences_order on public.order_evidences(order_id, created_at);
create index if not exists idx_order_evidences_tenant on public.order_evidences(tenant_id);

-- ============================================================
-- RLS — ORDER_EVIDENCES
-- ============================================================
alter table public.order_evidences enable row level security;

create policy "order_evidences_select"
  on public.order_evidences for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

create policy "order_evidences_insert"
  on public.order_evidences for insert
  with check (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

create policy "order_evidences_update"
  on public.order_evidences for update
  using (created_by = auth.uid());

create policy "order_evidences_delete"
  on public.order_evidences for delete
  using (
    created_by = auth.uid()
    or (tenant_id = public.get_meu_tenant() and public.get_meu_role() = 'admin')
  );
