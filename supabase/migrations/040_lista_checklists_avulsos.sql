-- ============================================================
-- ATOS — Migration 040: lista de checklists avulsos no servidor
-- ============================================================
-- Pedido do usuário (2026-09-25): a tela carregava TODOS os checklists
-- avulsos (sem paginação, sem busca, só chips) — com a recorrência o
-- volume cresce rápido, e o Supabase corta em 1.000 linhas SEM AVISO.
-- Desenho aprovado: abre em "Em aberto" (atrasados + hoje + próximos 7
-- dias); situação com contagens; período; cliente, unidade, técnico,
-- modelo, recorrência; busca no título; paginação no servidor.
-- Uma chamada devolve página + total + contagens (mesma regra de
-- situação do app: concluído / atrasado = prazo vencido / próximo =
-- data futura / hoje). SECURITY INVOKER: as policies continuam valendo.
-- ============================================================

create or replace function public.listar_checklists_avulsos(p jsonb default '{}', p_pagina int default 1, p_tamanho int default 25)
returns jsonb language plpgsql stable as $$
declare
  v_tenant uuid := public.get_meu_tenant();
  v_hoje date := public.fn_hoje_empresa(public.get_meu_tenant());
  v_sit text := coalesce(nullif(p->>'situacao', ''), 'aberto');
  v_q text := nullif(trim(coalesce(p->>'q', '')), '');
  v_tam int := greatest(1, least(coalesce(p_tamanho, 25), 100));
  v_pag int := greatest(1, coalesce(p_pagina, 1));
  v_res jsonb;
begin
  if v_q is not null then v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_'); end if;
  with base as (
    select i.*,
      case when i.status = 'concluido' then 'concluido'
           when i.prazo < v_hoje then 'atrasado'
           when i.data_prevista > v_hoje then 'proximo'
           else 'hoje' end as sit
    from public.checklist_instances i
    where i.context_type = 'avulso' and i.tenant_id = v_tenant
      and (p->>'de' is null or i.data_prevista >= (p->>'de')::date)
      and (p->>'ate' is null or i.data_prevista <= (p->>'ate')::date)
      and (p->>'cliente' is null or i.client_id = (p->>'cliente')::uuid)
      and (p->>'unidade' is null or i.location_id = (p->>'unidade')::uuid)
      and (p->>'modelo' is null or i.template_id = (p->>'modelo')::uuid)
      and (p->>'serie' is null or i.serie_id = (p->>'serie')::uuid)
      and (p->>'tecnico' is null or exists (select 1 from public.checklist_instance_targets t
                                            where t.instance_id = i.id and t.technician_id = (p->>'tecnico')::uuid))
      and (v_q is null or i.title_snapshot ilike '%' || v_q || '%')
  ),
  contagens as (
    select jsonb_build_object(
      'aberto', count(*) filter (where sit <> 'concluido' and (data_prevista is null or data_prevista <= v_hoje + 7)),
      'atrasado', count(*) filter (where sit = 'atrasado'),
      'hoje', count(*) filter (where sit = 'hoje'),
      'proximo', count(*) filter (where sit = 'proximo'),
      'em_andamento', count(*) filter (where status = 'em_andamento'),
      'concluido', count(*) filter (where sit = 'concluido'),
      'todos', count(*)) c
    from base
  ),
  filtrada as (
    select * from base b
    where case v_sit
      when 'aberto' then b.sit <> 'concluido' and (b.data_prevista is null or b.data_prevista <= v_hoje + 7)
      when 'em_andamento' then b.status = 'em_andamento'
      when 'todos' then true
      else b.sit = v_sit end
  ),
  ordenada as (
    select f.*, row_number() over (order by
      case when v_sit = 'concluido' then f.completed_at end desc nulls last,
      case when v_sit = 'todos' then f.data_prevista end desc nulls last,
      case when v_sit not in ('concluido', 'todos') then (f.sit = 'atrasado') end desc,
      case when v_sit not in ('concluido', 'todos') then f.data_prevista end asc nulls first,
      f.created_at desc, f.id) as ord
    from filtrada f
  ),
  pagina as (
    select * from ordenada where ord > (v_pag - 1) * v_tam and ord <= v_pag * v_tam
  )
  select jsonb_build_object(
    'hoje', v_hoje,
    'total', (select count(*) from filtrada),
    'contagens', (select c from contagens),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title_snapshot', g.title_snapshot, 'status', g.status, 'recurrence', g.recurrence,
        'serie_id', g.serie_id, 'data_prevista', g.data_prevista, 'prazo', g.prazo, 'completed_at', g.completed_at,
        'template_id', g.template_id, 'client_id', g.client_id, 'location_id', g.location_id, 'situacao', g.sit,
        'client', (select jsonb_build_object('id', c.id, 'name', c.name) from public.clients c where c.id = g.client_id),
        'location', (select jsonb_build_object('id', l.id, 'name', l.name) from public.locations l where l.id = g.location_id),
        'targets', coalesce((select jsonb_agg(jsonb_build_object('technician', jsonb_build_object('id', u.id, 'name', u.name)) order by u.name)
                             from public.checklist_instance_targets t join public.users u on u.id = t.technician_id
                             where t.instance_id = g.id), '[]'::jsonb)
      ) order by g.ord) from pagina g), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

-- próxima ocorrência em aberto de cada série (aba Recorrências), sem carregar a lista inteira
create or replace function public.proximas_das_series()
returns table (serie_id uuid, proxima date) language sql stable as $$
  select i.serie_id, min(i.data_prevista)
  from public.checklist_instances i
  where i.tenant_id = public.get_meu_tenant() and i.serie_id is not null and i.status <> 'concluido'
    and i.data_prevista >= public.fn_hoje_empresa(public.get_meu_tenant())
  group by i.serie_id
$$;
