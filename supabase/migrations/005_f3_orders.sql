-- ============================================================
-- ATOS — Migration 005 (F3): Ordens de Serviço
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
-- ============================================================

-- ============================================================
-- ORDER_SEQUENCES — controla numeração sequencial por tenant
-- ============================================================
create table if not exists public.order_sequences (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  last_number integer not null default 0
);

-- ============================================================
-- ORDERS — ordens de serviço
-- ============================================================
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  number          text not null,
  client_id       uuid not null references public.clients(id) on delete restrict,
  location_id     uuid references public.locations(id) on delete set null,
  technician_id   uuid references public.users(id) on delete set null,
  title           text not null,
  description     text,
  priority        text not null default 'normal',
  status          text not null default 'aberta',
  scheduled_at    timestamptz,
  schedule_reason text,
  pause_reason    text,
  cancel_reason   text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_orders_tenant on public.orders(tenant_id);
create index if not exists idx_orders_client on public.orders(client_id);
create index if not exists idx_orders_technician on public.orders(technician_id);
create index if not exists idx_orders_status on public.orders(tenant_id, status);

-- ============================================================
-- TRIGGER: numeração sequencial por tenant (OS-0001, OS-0002, ...)
-- ============================================================
create or replace function public.gerar_numero_os()
returns trigger as $$
declare
  novo_numero integer;
begin
  insert into public.order_sequences (tenant_id, last_number)
  values (new.tenant_id, 0)
  on conflict (tenant_id) do nothing;

  update public.order_sequences
  set last_number = last_number + 1
  where tenant_id = new.tenant_id
  returning last_number into novo_numero;

  new.number := 'OS-' || lpad(novo_numero::text, 4, '0');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_order_created
  before insert on public.orders
  for each row execute function public.gerar_numero_os();

create trigger handle_orders_updated_at
  before update on public.orders
  for each row execute function public.handle_updated_at();

-- ============================================================
-- RLS — ORDER_SEQUENCES
-- ============================================================
alter table public.order_sequences enable row level security;

create policy "order_sequences_select"
  on public.order_sequences for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

-- ============================================================
-- RLS — ORDERS
-- ============================================================
alter table public.orders enable row level security;

create policy "orders_select"
  on public.orders for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

create policy "orders_insert"
  on public.orders for insert
  with check (
    public.get_meu_role() = 'super_admin'
    or (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin','gestor'))
  );

create policy "orders_update"
  on public.orders for update
  using (
    public.get_meu_role() = 'super_admin'
    or (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin','gestor'))
    or (tenant_id = public.get_meu_tenant() and technician_id = auth.uid())
  );

create policy "orders_delete"
  on public.orders for delete
  using (
    public.get_meu_role() = 'super_admin'
    or (tenant_id = public.get_meu_tenant() and public.get_meu_role() = 'admin')
  );
