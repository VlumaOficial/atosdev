-- ============================================================
-- ATOS — Migration 041: lista de Ordens de Serviço no servidor
-- ============================================================
-- Mesmo problema e desenho da 040 (aprovado em 2026-09-25): a tela de
-- OS carregava todas as OS e filtrava no navegador — com ~300 OS/mês a
-- Infoxtec chegaria ao corte silencioso de 1.000 linhas em 3–4 meses.
-- Filtros: situação (com contagens, "Em aberto" = não concluída nem
-- cancelada), período pela data de ABERTURA (dia no fuso da empresa),
-- cliente, unidade, técnico (ou "sem técnico"), prioridade; busca em
-- número, título, cliente e técnico. Mais recentes primeiro (como antes).
-- SECURITY INVOKER: as policies de orders continuam valendo.
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
    select o.* from public.orders o
    where o.tenant_id = v_tenant
      and (p->>'de' is null or (o.created_at at time zone v_fuso)::date >= (p->>'de')::date)
      and (p->>'ate' is null or (o.created_at at time zone v_fuso)::date <= (p->>'ate')::date)
      and (p->>'cliente' is null or o.client_id = (p->>'cliente')::uuid)
      and (p->>'unidade' is null or o.location_id = (p->>'unidade')::uuid)
      and (p->>'prioridade' is null or o.priority = p->>'prioridade')
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
      'cancelada', count(*) filter (where status = 'cancelada')) c
    from base
  ),
  filtrada as (
    select * from base b
    where case v_sit when 'todas' then true
                     when 'em_aberto' then b.status not in ('concluida', 'cancelada')
                     else b.status = v_sit end
  ),
  ordenada as (
    select f.*, row_number() over (order by f.created_at desc, f.id) as ord from filtrada f
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
          'technician', (select jsonb_build_object('id', u.id, 'name', u.name) from public.users u where u.id = g.technician_id))
      order by g.ord) from pagina g), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
