-- ============================================================
-- ATOS — Migration 016 (F5): Checklist avulso (sem OS)
-- ============================================================
-- Vínculo opcional a Cliente/Unidade para checklists que não nascem
-- de uma Ordem de Serviço (vistoria, inspeção, levantamento). Ambos
-- nullable — mesmo padrão de checklist_templates.client_id ("geral"
-- quando vazio). context_type='avulso' passa a ser usado pela app
-- para distinguir de context_type='order' (já existente).
-- ============================================================

alter table public.checklist_instances
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists location_id uuid references public.locations(id) on delete set null;

create index if not exists idx_cl_instances_client on public.checklist_instances(client_id);
create index if not exists idx_cl_instances_location on public.checklist_instances(location_id);
