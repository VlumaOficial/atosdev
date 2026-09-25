-- ============================================================
-- ATOS — Migration 043: técnico só acessa dados das OS/checklists dele
-- ============================================================
-- Levantamento de 2026-09-25 (resíduo da 042), autorizado pelo usuário:
--  (A) LEITURA liberada por empresa: order_comments, order_events,
--      order_evidences, order_reports, fotos_verificacao e storage
--      "evidencias" (fotos, assinaturas, PDFs, listagem)
--  (B) LEITURA E ESCRITA liberadas por empresa (policy ALL):
--      checklist_instances, checklist_answers, checklist_instance_targets
--      e checklist_answer_history — técnico podia concluir/reabrir/excluir
--      checklist de outro, mudar respostas, se atribuir e APAGAR a trilha
--      de auditoria da F5
-- Regra nova: admin/gestor/Super Admin continuam com a empresa toda; o
-- TÉCNICO acessa só OS atribuídas a ele e checklists dessas OS ou
-- avulsos em que está atribuído. Histórico de respostas: só leitura
-- para todos (quem grava é o gatilho, SECURITY DEFINER). Atribuições,
-- criação e exclusão de checklists: só admin/gestor.
-- Funções SECURITY DEFINER evitam recursão entre policies.
-- ============================================================

create or replace function public.pode_ver_os(p_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.get_meu_role() = 'super_admin' or exists (
    select 1 from public.orders o
    where o.id = p_order and o.tenant_id = public.get_meu_tenant()
      and (public.get_meu_role() <> 'tecnico' or o.technician_id = auth.uid()))
$$;

create or replace function public.pode_ver_checklist(p_instance uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.get_meu_role() = 'super_admin' or exists (
    select 1 from public.checklist_instances i
    where i.id = p_instance and i.tenant_id = public.get_meu_tenant()
      and (public.get_meu_role() <> 'tecnico'
           or (i.order_id is not null and exists (select 1 from public.orders o where o.id = i.order_id and o.technician_id = auth.uid()))
           or exists (select 1 from public.checklist_instance_targets t where t.instance_id = i.id and t.technician_id = auth.uid())))
$$;

-- Arquivo do bucket "evidencias" pelo caminho:
--   {empresa}/logo.png · {empresa}/os/{OS}/… · {empresa}/checklist/{checklist}/…
--   {empresa}/assinaturas/{OS}.png | {OS}_responsavel.png · {empresa}/assinaturas/tecnicos/{usuário}.png
--   {empresa}/relatorios/{OS}_v{n}.pdf
-- p_escrita: logo só admin/gestor gravam
create or replace function public.pode_acessar_arquivo(p_name text, p_escrita boolean default false)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v text[] := string_to_array(p_name, '/'); v_papel text := public.get_meu_role(); v_id text;
begin
  if v_papel = 'super_admin' then return true; end if;
  if v[1] is distinct from public.get_meu_tenant()::text then return false; end if;
  if p_name = v[1] || '/logo.png' then return not p_escrita or v_papel in ('admin', 'gestor'); end if;
  if v_papel <> 'tecnico' then return true; end if;
  if v[2] = 'assinaturas' and v[3] = 'tecnicos' then
    return split_part(v[4], '.', 1) = auth.uid()::text;
  end if;
  v_id := substring(coalesce(v[3], '') from '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})');
  if v_id is null then return false; end if;
  if v[2] in ('os', 'assinaturas', 'relatorios') then return public.pode_ver_os(v_id::uuid); end if;
  if v[2] = 'checklist' then return public.pode_ver_checklist(v_id::uuid); end if;
  return false;
end $$;

-- ---------- (B) checklists ----------
drop policy if exists cl_instances_all on public.checklist_instances;
create policy cl_instances_select on public.checklist_instances for select using (public.pode_ver_checklist(id));
create policy cl_instances_insert on public.checklist_instances for insert
  with check (public.get_meu_role() = 'super_admin' or (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor')));
create policy cl_instances_update on public.checklist_instances for update
  using (public.pode_ver_checklist(id)) with check (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
create policy cl_instances_delete on public.checklist_instances for delete
  using (public.get_meu_role() = 'super_admin' or (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor')));

drop policy if exists cl_answers_all on public.checklist_answers;
create policy cl_answers_all on public.checklist_answers for all
  using (public.pode_ver_checklist(instance_id))
  with check (public.pode_ver_checklist(instance_id) and (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant()));

drop policy if exists cl_targets_all on public.checklist_instance_targets;
create policy cl_targets_select on public.checklist_instance_targets for select
  using (public.get_meu_role() = 'super_admin'
         or (tenant_id = public.get_meu_tenant() and (public.get_meu_role() <> 'tecnico' or technician_id = auth.uid())));
create policy cl_targets_write on public.checklist_instance_targets for all
  using (public.get_meu_role() = 'super_admin' or (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor')))
  with check (public.get_meu_role() = 'super_admin' or (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor')));

-- histórico: só leitura (o gatilho fn_checklist_answer_history grava como SECURITY DEFINER)
drop policy if exists cl_answer_hist_all on public.checklist_answer_history;
create policy cl_answer_hist_select on public.checklist_answer_history for select using (public.pode_ver_checklist(instance_id));

-- ---------- (A) dados da OS ----------
drop policy if exists order_comments_select on public.order_comments;
create policy order_comments_select on public.order_comments for select using (public.pode_ver_os(order_id));
drop policy if exists order_comments_insert on public.order_comments;
create policy order_comments_insert on public.order_comments for insert
  with check (public.pode_ver_os(order_id) and (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant()));

drop policy if exists order_events_select on public.order_events;
create policy order_events_select on public.order_events for select using (public.pode_ver_os(order_id));
drop policy if exists order_events_insert on public.order_events;
create policy order_events_insert on public.order_events for insert
  with check (public.pode_ver_os(order_id) and (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant()));

drop policy if exists order_evidences_select on public.order_evidences;
create policy order_evidences_select on public.order_evidences for select using (public.pode_ver_os(order_id));
drop policy if exists order_evidences_insert on public.order_evidences;
create policy order_evidences_insert on public.order_evidences for insert
  with check (public.pode_ver_os(order_id) and (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant()));

drop policy if exists order_reports_select on public.order_reports;
create policy order_reports_select on public.order_reports for select using (public.pode_ver_os(order_id));

drop policy if exists fotos_verificacao_select on public.fotos_verificacao;
create policy fotos_verificacao_select on public.fotos_verificacao for select
  using (public.get_meu_role() = 'super_admin' or (tenant_id = public.get_meu_tenant() and public.pode_acessar_arquivo(file_path)));
drop policy if exists fotos_verificacao_insert on public.fotos_verificacao;
create policy fotos_verificacao_insert on public.fotos_verificacao for insert
  with check (tenant_id = public.get_meu_tenant() and public.pode_acessar_arquivo(file_path, true));

-- ---------- (A) arquivos ----------
drop policy if exists evidencias_select on storage.objects;
create policy evidencias_select on storage.objects for select
  using (bucket_id = 'evidencias' and public.pode_acessar_arquivo(name));
drop policy if exists evidencias_insert on storage.objects;
create policy evidencias_insert on storage.objects for insert
  with check (bucket_id = 'evidencias' and public.pode_acessar_arquivo(name, true));
drop policy if exists evidencias_delete on storage.objects;
create policy evidencias_delete on storage.objects for delete
  using (bucket_id = 'evidencias' and public.pode_acessar_arquivo(name, true));
-- UPDATE continua só para logo e assinaturas (migration 027), agora também por dono
drop policy if exists evidencias_update on storage.objects;
create policy evidencias_update on storage.objects for update
  using (bucket_id = 'evidencias' and public.pode_acessar_arquivo(name, true)
         and (name ~ '^[^/]+/logo\.png$' or split_part(name, '/', 2) = 'assinaturas'))
  with check (bucket_id = 'evidencias' and public.pode_acessar_arquivo(name, true)
              and (name ~ '^[^/]+/logo\.png$' or split_part(name, '/', 2) = 'assinaturas'));
