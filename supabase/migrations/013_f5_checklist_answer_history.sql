-- ============================================================
-- ATOS — Migration 013 (F5): Rastreabilidade das respostas do checklist
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
--
-- Regra de negócio (ver VISAO_ATOS.md, item 9.7): o técnico pode
-- editar uma resposta já salva; toda alteração gera um registro do
-- estado ANTERIOR via trigger no banco, garantindo trilha completa
-- de auditoria independente da origem (técnico, admin, futuro app).
-- Pendente: tela de consulta desse histórico (item de backlog 9.7).
-- ============================================================

create table if not exists public.checklist_answer_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  instance_id    uuid not null references public.checklist_instances(id) on delete cascade,
  item_id        uuid,
  label_snapshot text,
  value_old      jsonb,
  file_path_old  text,
  changed_at     timestamptz not null default now(),
  changed_by     uuid references public.users(id) on delete set null
);

create index if not exists idx_cl_answer_hist_instance on public.checklist_answer_history(instance_id);
create index if not exists idx_cl_answer_hist_item on public.checklist_answer_history(item_id);
create index if not exists idx_cl_answer_hist_changed on public.checklist_answer_history(changed_at desc);

-- ============================================================
-- TRIGGER: grava o estado anterior sempre que value ou file_path
-- de uma resposta já existente mudarem
-- ============================================================
create or replace function public.fn_checklist_answer_history()
returns trigger as $$
begin
  if (OLD.value is distinct from NEW.value) or (OLD.file_path is distinct from NEW.file_path) then
    insert into public.checklist_answer_history (
      tenant_id, instance_id, item_id, label_snapshot, value_old, file_path_old, changed_by
    ) values (
      OLD.tenant_id, OLD.instance_id, OLD.item_id, OLD.label_snapshot, OLD.value, OLD.file_path, auth.uid()
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_checklist_answer_history
  before update on public.checklist_answers
  for each row execute function public.fn_checklist_answer_history();

-- ============================================================
-- RLS — imutável (só leitura via policy tenant); inserts só pelo
-- trigger SECURITY DEFINER acima
-- ============================================================
alter table public.checklist_answer_history enable row level security;

create policy "cl_answer_hist_all"
  on public.checklist_answer_history for all
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant())
  with check (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
