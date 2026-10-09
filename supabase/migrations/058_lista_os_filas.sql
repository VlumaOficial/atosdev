-- ============================================================
-- ATOS — Migration 058: lista de OS com filas de atendimento (portal E2)
-- ============================================================
-- listar_os passa a aceitar grupo (uuid do grupo, ou "sem" = OS sem grupo),
-- devolve o grupo de cada OS e a contagem "novos_sem_grupo" (OS em aberto, sem
-- grupo e sem técnico — a fila de entrada do N1). As filas da tela são
-- combinações de filtros: Novos sem grupo = grupo "sem" + técnico "sem";
-- Fila do grupo X = grupo X + técnico "sem"; Minhas = técnico = eu.
-- Resto idêntico à 047.
-- ============================================================

create or replace function public.listar_os(p jsonb default '{}', p_pagina int default 1, p_tamanho int default 25)
returns jsonb language plpgsql stable as $$
declare
  v_tenant uuid := public.get_meu_tenant();
  v_fuso text := coalesce((select fuso_horario from public.tenants where id = public.get_meu_tenant()), 'America/Sao_Paulo');
  v_sit text := coalesce(nullif(p->>'situacao', ''), 'todas');
  v_q text := nullif(trim(coalesce(p->>'q', '')), '');
  v_tam int := greatest(1, least(coalesce(p_tamanho, 25), 100));
  v_pag int := greatest(1, coalesce(p_pagina, 1));
  v_res jsonb;
begin
  if v_q is not null then v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_'); end if;
  with base as (
    select o.*, public.sla_situacao(o) as sla_sit from public.orders o
    where o.tenant_id = v_tenant
      -- período pela abertura (padrão) ou pela conclusão (links do painel gerencial)
      and (p->>'de' is null or ((case when p->>'periodo_por' = 'conclusao' then o.completed_at else o.created_at end) at time zone v_fuso)::date >= (p->>'de')::date)
      and (p->>'ate' is null or ((case when p->>'periodo_por' = 'conclusao' then o.completed_at else o.created_at end) at time zone v_fuso)::date <= (p->>'ate')::date)
      and (p->>'cliente' is null or o.client_id = (p->>'cliente')::uuid)
      and (p->>'unidade' is null or o.location_id = (p->>'unidade')::uuid)
      and (p->>'prioridade' is null or o.priority = any(string_to_array(p->>'prioridade', ',')))   -- aceita lista (ex.: critico,alto)
      and (p->>'grupo' is null
           or (p->>'grupo' = 'sem' and o.grupo_id is null)
           or (p->>'grupo' <> 'sem' and o.grupo_id = (p->>'grupo')::uuid))
      and (p->>'tipo' is null or o.tipo = p->>'tipo')
      and (p->>'categoria' is null or o.categoria_id = (p->>'categoria')::uuid
           or o.categoria_id in (select c.id from public.os_categorias c where c.pai_id = (p->>'categoria')::uuid))
      and (p->>'sla' is null or public.sla_situacao(o) = p->>'sla')
      and (p->>'tecnico' is null
           or (p->>'tecnico' = 'sem' and o.technician_id is null)
           or (p->>'tecnico' <> 'sem' and o.technician_id = (p->>'tecnico')::uuid))
      and (v_q is null or o.number ilike '%' || v_q || '%' or o.title ilike '%' || v_q || '%'
           or exists (select 1 from public.clients c where c.id = o.client_id and c.name ilike '%' || v_q || '%')
           or exists (select 1 from public.users u where u.id = o.technician_id and u.name ilike '%' || v_q || '%'))
  ),
  contagens as (
    select jsonb_build_object(
      'todas', count(*),
      'em_aberto', count(*) filter (where status not in ('concluida', 'cancelada')),
      'aberta', count(*) filter (where status = 'aberta'),
      'agendada', count(*) filter (where status = 'agendada'),
      'em_andamento', count(*) filter (where status = 'em_andamento'),
      'pausada', count(*) filter (where status = 'pausada'),
      'concluida', count(*) filter (where status = 'concluida'),
      'cancelada', count(*) filter (where status = 'cancelada'),
      'novos_sem_grupo', count(*) filter (where grupo_id is null and technician_id is null and status not in ('concluida', 'cancelada')),
      'sla_vencido', count(*) filter (where sla_sit = 'vencido'),
      'sla_em_risco', count(*) filter (where sla_sit = 'em_risco')) c
    from base
  ),
  filtrada as (
    select * from base b
    where case v_sit when 'todas' then true
                     when 'em_aberto' then b.status not in ('concluida', 'cancelada')
                     else b.status = v_sit end
  ),
  ordenada as (
    -- "Em aberto": o que vence primeiro no topo (decisão 2026-09-25); demais: mais recentes
    select f.*, row_number() over (order by
      case when v_sit = 'em_aberto' then (case when f.atendido_em is null then least(f.prazo_atendimento, f.prazo_solucao) else f.prazo_solucao end) end asc nulls last,
      f.created_at desc, f.id) as ord from filtrada f
  ),
  pagina as (
    select * from ordenada where ord > (v_pag - 1) * v_tam and ord <= v_pag * v_tam
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    'contagens', (select c from contagens),
    'itens', coalesce((select jsonb_agg(
        (to_jsonb(g) - 'ord') || jsonb_build_object(
          'client', (select jsonb_build_object('id', c.id, 'name', c.name) from public.clients c where c.id = g.client_id),
          'location', (select jsonb_build_object('id', l.id, 'name', l.name) from public.locations l where l.id = g.location_id),
          'technician', (select jsonb_build_object('id', u.id, 'name', u.name) from public.users u where u.id = g.technician_id),
          'grupo', (select jsonb_build_object('id', gr.id, 'nome', gr.nome, 'nivel', gr.nivel) from public.grupos_atendimento gr where gr.id = g.grupo_id),
          'categoria', (select jsonb_build_object('id', c.id, 'nome', c.nome, 'pai', (select p2.nome from public.os_categorias p2 where p2.id = c.pai_id)) from public.os_categorias c where c.id = g.categoria_id))
      order by g.ord) from pagina g), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
