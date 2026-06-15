-- ============================================================
-- ATOS — Migration 003 (F2): Clientes e Locais
-- ============================================================

-- ============================================================
-- CLIENTS (empresas atendidas pelo tenant)
-- ============================================================
create table if not exists public.clients (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  cnpj        text,
  email       text,
  phone       text,
  address     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_clients_tenant on public.clients(tenant_id);

-- ============================================================
-- LOCATIONS (unidades/locais de cada cliente)
-- ============================================================
create table if not exists public.locations (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  name        text not null,
  address     text,
  city        text,
  state       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_locations_tenant on public.locations(tenant_id);
create index if not exists idx_locations_client on public.locations(client_id);

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.handle_updated_at();

create trigger locations_updated_at
  before update on public.locations
  for each row execute function public.handle_updated_at();

-- ============================================================
-- RLS — CLIENTS
-- ============================================================
alter table public.clients enable row level security;

create policy "clients_super_admin_all"
  on public.clients for all
  using (public.get_meu_role() = 'super_admin');

create policy "clients_tenant_select"
  on public.clients for select
  using (tenant_id = public.get_meu_tenant());

create policy "clients_tenant_insert"
  on public.clients for insert
  with check (
    tenant_id = public.get_meu_tenant()
    and public.get_meu_role() in ('admin','gestor')
  );

create policy "clients_tenant_update"
  on public.clients for update
  using (
    tenant_id = public.get_meu_tenant()
    and public.get_meu_role() in ('admin','gestor')
  );

create policy "clients_tenant_delete"
  on public.clients for delete
  using (
    tenant_id = public.get_meu_tenant()
    and public.get_meu_role() in ('admin','gestor')
  );

-- ============================================================
-- RLS — LOCATIONS
-- ============================================================
alter table public.locations enable row level security;

create policy "locations_super_admin_all"
  on public.locations for all
  using (public.get_meu_role() = 'super_admin');

create policy "locations_tenant_select"
  on public.locations for select
  using (tenant_id = public.get_meu_tenant());

create policy "locations_tenant_insert"
  on public.locations for insert
  with check (
    tenant_id = public.get_meu_tenant()
    and public.get_meu_role() in ('admin','gestor')
  );

create policy "locations_tenant_update"
  on public.locations for update
  using (
    tenant_id = public.get_meu_tenant()
    and public.get_meu_role() in ('admin','gestor')
  );

create policy "locations_tenant_delete"
  on public.locations for delete
  using (
    tenant_id = public.get_meu_tenant()
    and public.get_meu_role() in ('admin','gestor')
  );
