-- ============================================================
-- ATOS — Migration 011 (F5): Instâncias de checklist e respostas
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
-- ============================================================

-- ============================================================
-- CHECKLIST_INSTANCES — um checklist associado a uma OS (ou outro
-- contexto futuro, via context_type)
-- ============================================================
create table if not exists public.checklist_instances (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  template_id   uuid not null references public.checklist_templates(id) on delete restrict,
  title_snapshot text not null,
  context_type  text not null,
  order_id      uuid references public.orders(id) on delete cascade,
  recurrence    text,
  status        text not null default 'pendente',
  completed_at  timestamptz,
  completed_by  uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id) on delete set null,
  reopened_at   timestamptz,
  reopened_by   uuid references public.users(id) on delete set null
);

create index if not exists idx_cl_instances_tenant on public.checklist_instances(tenant_id);
create index if not exists idx_cl_instances_order on public.checklist_instances(order_id);

-- ============================================================
-- CHECKLIST_INSTANCE_TARGETS — técnico(s) responsável(is) pela instância
-- ============================================================
create table if not exists public.checklist_instance_targets (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  instance_id   uuid not null references public.checklist_instances(id) on delete cascade,
  technician_id uuid not null references public.users(id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index if not exists idx_cl_targets_instance on public.checklist_instance_targets(instance_id);
create index if not exists idx_cl_targets_tech on public.checklist_instance_targets(technician_id);

-- ============================================================
-- CHECKLIST_ANSWERS — resposta atual de cada item da instância
-- (permite preenchimento parcial e edição posterior; histórico de
-- alterações fica em checklist_answer_history — migration 013)
-- ============================================================
create table if not exists public.checklist_answers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  instance_id    uuid not null references public.checklist_instances(id) on delete cascade,
  item_id        uuid references public.checklist_template_items(id) on delete set null,
  label_snapshot text,
  response_type  text,
  value          jsonb default '{}'::jsonb,
  file_path      text,
  answered_at    timestamptz not null default now(),
  answered_by    uuid references public.users(id) on delete set null
);

create index if not exists idx_cl_answers_instance on public.checklist_answers(instance_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.checklist_instances enable row level security;
alter table public.checklist_instance_targets enable row level security;
alter table public.checklist_answers enable row level security;

create policy "cl_instances_all"
  on public.checklist_instances for all
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant())
  with check (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

create policy "cl_targets_all"
  on public.checklist_instance_targets for all
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant())
  with check (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

create policy "cl_answers_all"
  on public.checklist_answers for all
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant())
  with check (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
