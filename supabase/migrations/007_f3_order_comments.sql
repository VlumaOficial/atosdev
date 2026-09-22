-- ============================================================
-- ATOS — Migration 007 (F3): Comentários na OS
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
-- ============================================================

create table if not exists public.order_comments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  order_id    uuid not null references public.orders(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  author_name text,
  comment     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_order_comments_tenant on public.order_comments(tenant_id);
create index if not exists idx_order_comments_order on public.order_comments(order_id, created_at);

-- ============================================================
-- RLS — ORDER_COMMENTS
-- ============================================================
alter table public.order_comments enable row level security;

create policy "order_comments_select"
  on public.order_comments for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

create policy "order_comments_insert"
  on public.order_comments for insert
  with check (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

create policy "order_comments_update"
  on public.order_comments for update
  using (user_id = auth.uid());

create policy "order_comments_delete"
  on public.order_comments for delete
  using (
    user_id = auth.uid()
    or (tenant_id = public.get_meu_tenant() and public.get_meu_role() = 'admin')
  );
