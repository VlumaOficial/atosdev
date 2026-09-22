-- ============================================================
-- ATOS — Migration 010 (F5): Templates de checklist
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
-- ============================================================

-- ============================================================
-- CHECKLIST_TEMPLATES — roteiros de verificação configuráveis
-- ============================================================
create table if not exists public.checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  name        text not null,
  description text,
  client_id   uuid references public.clients(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id) on delete set null
);

create index if not exists idx_cl_templates_tenant on public.checklist_templates(tenant_id);

-- ============================================================
-- CHECKLIST_TEMPLATE_ITEMS — itens de cada template
-- ============================================================
-- "fields" (jsonb) guarda a definição dos campos do item (tipo de
-- resposta, opções etc.), substituindo colunas fixas de tipo/opções.
create table if not exists public.checklist_template_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  label       text not null,
  is_required boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  fields      jsonb not null default '[]'::jsonb
);

create index if not exists idx_cl_items_template on public.checklist_template_items(template_id, "position");

-- ============================================================
-- RLS
-- ============================================================
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;

create policy "cl_templates_all"
  on public.checklist_templates for all
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant())
  with check (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

create policy "cl_items_all"
  on public.checklist_template_items for all
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant())
  with check (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
