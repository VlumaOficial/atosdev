-- ============================================================
-- ATOS — Migration 046: painel gerencial (F7)
-- ============================================================
-- KPIs aprovados pelo usuário (2026-09-25, VISAO_ATOS.md "KPIs do painel"):
--   Agora (tempo real): vencidos · em risco · sem técnico · Crítico/Alto
--   em aberto · preventivas atrasadas
--   Desempenho do período (vs período anterior de mesmo tamanho): % SLA
--   cumprido (meta configurável) · concluídas · tempo médio até o
--   atendimento · tempo médio de solução (horas úteis, sem as pausas que
--   param o relógio) · resolução na 1ª visita (incidentes) · idade do
--   backlog
--   Equipe · Clientes (volume, % SLA, reincidência) · Preventivas · Comprovação
-- Os tempos são calculados e GRAVADOS na conclusão (o painel não recalcula
-- horas úteis). Uma chamada devolve o painel inteiro; só admin/gestor.
-- ============================================================

alter table public.tenants add column if not exists sla_meta_pct int not null default 90 check (sla_meta_pct between 50 and 100);
alter table public.orders add column if not exists tempo_atendimento_min int;   -- abertura → 1º início (minutos úteis)
alter table public.orders add column if not exists tempo_solucao_min int;       -- abertura → conclusão, sem pausas que param o relógio

create or replace function public.fn_os_tempos_uteis(o public.orders, out atend int, out sol int)
language plpgsql stable security definer set search_path = public as $$
declare v_h uuid := coalesce(o.sla_horario_id, public.horario_padrao(o.tenant_id)); v_ibge text;
begin
  if v_h is null or o.completed_at is null then return; end if;
  select cidade_ibge into v_ibge from public.locations where id = o.location_id;
  atend := (extract(epoch from public.horas_uteis_entre(v_h, o.created_at, coalesce(o.atendido_em, o.completed_at), v_ibge)) / 60)::int;
  sol := greatest(0, (extract(epoch from public.horas_uteis_entre(v_h, o.created_at, o.completed_at, v_ibge)) / 60)::int - coalesce(o.sla_pausa_min, 0));
end $$;

-- grava na conclusão; reabrir limpa (roda depois de trg_orders_sla*, por ordem de nome)
create or replace function public.fn_orders_tempos()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status <> 'concluida' or new.completed_at is distinct from old.completed_at) then
    select * into t from public.fn_os_tempos_uteis(new);
    new.tempo_atendimento_min := t.atend; new.tempo_solucao_min := t.sol;
  elsif tg_op = 'UPDATE' and old.status = 'concluida' and new.status <> 'concluida' then
    new.tempo_atendimento_min := null; new.tempo_solucao_min := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_tempos on public.orders;
create trigger trg_orders_tempos before insert or update on public.orders
  for each row execute function public.fn_orders_tempos();

-- OS já concluídas (sem mexer na data de alteração: o app do técnico usa updated_at)
alter table public.orders disable trigger handle_orders_updated_at;
update public.orders o set tempo_atendimento_min = t.atend, tempo_solucao_min = t.sol
from (select id, (public.fn_os_tempos_uteis(x)).* from public.orders x where x.status = 'concluida' and x.completed_at is not null) t
where o.id = t.id;
alter table public.orders enable trigger handle_orders_updated_at;

create or replace function public.definir_meta_sla(p_meta int)
returns void language plpgsql security definer as $$
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  if p_meta not between 50 and 100 then raise exception 'A meta precisa ficar entre 50%% e 100%%'; end if;
  update public.tenants set sla_meta_pct = p_meta where id = public.get_meu_tenant();
end $$;

-- OS da empresa com os filtros do painel (cliente, técnico, categoria com subcategorias)
create or replace function public.painel_os(p jsonb)
returns setof public.orders language sql stable as $$
  select o.* from public.orders o
  where o.tenant_id = public.get_meu_tenant()
    and (p->>'cliente' is null or o.client_id = (p->>'cliente')::uuid)
    and (p->>'tecnico' is null or o.technician_id = (p->>'tecnico')::uuid)
    and (p->>'categoria' is null or o.categoria_id = (p->>'categoria')::uuid
         or o.categoria_id in (select c.id from public.os_categorias c where c.pai_id = (p->>'categoria')::uuid))
$$;

-- resolvida na 1ª visita: incidente concluído, não reaberto, e sem nova OS da
-- mesma unidade (ou cliente, se sem unidade) e mesma categoria em 30 dias
create or replace function public.fn_primeira_visita(p_id uuid)
returns boolean language sql stable as $$
  with o as (select * from public.orders where id = p_id)
  select not exists (select 1 from public.order_events e where e.order_id = o.id and e.event_type = 'reopened')
     and not exists (select 1 from public.orders n where n.tenant_id = o.tenant_id and n.id <> o.id and n.tipo = 'incidente'
                     and n.created_at > o.completed_at and n.created_at <= o.completed_at + interval '30 days'
                     and (case when o.location_id is not null then n.location_id = o.location_id else n.client_id = o.client_id end)
                     and n.categoria_id is not distinct from o.categoria_id)
  from o
$$;

-- desempenho de um intervalo de datas (dias locais da empresa)
create or replace function public.painel_desempenho(p jsonb, p_de date, p_ate date)
returns jsonb language plpgsql stable as $$
declare v_fuso text := coalesce((select fuso_horario from public.tenants where id = public.get_meu_tenant()), 'America/Sao_Paulo');
  v_ini timestamptz := p_de::timestamp at time zone v_fuso; v_fim timestamptz := (p_ate + 1)::timestamp at time zone v_fuso; r jsonb;
begin
  with os as (select * from public.painel_os(p)),
  concl as (select * from os where status = 'concluida' and completed_at >= v_ini and completed_at < v_fim)
  select jsonb_build_object(
    'abertas', (select count(*) from os where created_at >= v_ini and created_at < v_fim),
    'concluidas', (select count(*) from concl),
    'sla_total', (select count(*) from concl where prazo_solucao is not null),
    'sla_ok', (select count(*) from concl where prazo_solucao is not null and coalesce(sla_solucao_ok, true) and coalesce(sla_atendimento_ok, true) and coalesce(sla_resposta_ok, true)),
    'mtta_min', (select round(avg(tempo_atendimento_min)) from concl where tempo_atendimento_min is not null),
    'mttr_min', (select round(avg(tempo_solucao_min)) from concl where tempo_solucao_min is not null),
    'inc_total', (select count(*) from concl where tipo = 'incidente'),
    'inc_primeira', (select count(*) from concl c where c.tipo = 'incidente' and public.fn_primeira_visita(c.id)),
    'com_assinatura', (select count(*) from concl where signature_path is not null),
    'com_foto', (select count(*) from concl c where exists (select 1 from public.order_evidences e where e.order_id = c.id)
                   or exists (select 1 from public.checklist_answers a join public.checklist_instances i on i.id = a.instance_id where i.order_id = c.id and a.file_path is not null)),
    'com_relatorio', (select count(*) from concl c where exists (select 1 from public.order_events e where e.order_id = c.id and e.event_type = 'report_sent'))
  ) into r;
  return r;
end $$;

create or replace function public.painel_gerencial(p jsonb default '{}')
returns jsonb language plpgsql stable as $$
declare
  v_tenant uuid := public.get_meu_tenant();
  v_fuso text := coalesce((select fuso_horario from public.tenants where id = public.get_meu_tenant()), 'America/Sao_Paulo');
  v_hoje date := public.fn_hoje_empresa(public.get_meu_tenant());
  v_de date := coalesce((p->>'de')::date, date_trunc('month', public.fn_hoje_empresa(public.get_meu_tenant()))::date);
  v_ate date := coalesce((p->>'ate')::date, public.fn_hoje_empresa(public.get_meu_tenant()));
  v_dias int; v_semanal boolean; v_ini timestamptz; v_fim timestamptz; r jsonb;
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  if v_ate < v_de then raise exception 'Período inválido'; end if;
  v_dias := v_ate - v_de + 1;
  v_semanal := v_dias > 31;
  v_ini := v_de::timestamp at time zone v_fuso; v_fim := (v_ate + 1)::timestamp at time zone v_fuso;

  with os as (select o.*, public.sla_situacao(o) as sit from public.painel_os(p) o),
  abertas as (select * from os where status not in ('concluida', 'cancelada')),
  ck as (
    select i.* from public.checklist_instances i
    where i.tenant_id = v_tenant and i.context_type = 'avulso'
      and (p->>'cliente' is null or i.client_id = (p->>'cliente')::uuid)
      and (p->>'tecnico' is null or exists (select 1 from public.checklist_instance_targets t where t.instance_id = i.id and t.technician_id = (p->>'tecnico')::uuid))
  ),
  baldes as (
    select g::date as ini, least(case when v_semanal then g::date + 6 else g::date end, v_ate) as fim
    from generate_series(case when v_semanal then date_trunc('week', v_de)::date else v_de end, v_ate,
                         case when v_semanal then interval '7 days' else interval '1 day' end) g
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('de', v_de, 'ate', v_ate, 'hoje', v_hoje, 'dias', v_dias, 'semanal', v_semanal,
                                  'ant_de', v_de - v_dias, 'ant_ate', v_de - 1),
    'meta_sla', (select sla_meta_pct from public.tenants where id = v_tenant),
    'agora', jsonb_build_object(
      'vencidos', (select count(*) from abertas where sit = 'vencido'),
      'em_risco', (select count(*) from abertas where sit = 'em_risco'),
      'sem_tecnico', (select count(*) from abertas where technician_id is null),
      'criticos_altos', (select count(*) from abertas where priority in ('critico', 'alto')),
      'checklists_atrasados', (select count(*) from ck where status <> 'concluido' and prazo < v_hoje),
      'os_preventivas_vencidas', (select count(*) from abertas where tipo = 'preventiva' and sit = 'vencido'),
      'em_aberto', (select count(*) from abertas)),
    'atual', public.painel_desempenho(p, v_de, v_ate),
    'anterior', public.painel_desempenho(p, v_de - v_dias, v_de - 1),
    'idade_backlog', (select jsonb_build_object(
        'ate2', count(*) filter (where now() - created_at < interval '3 days'),
        'de3a7', count(*) filter (where now() - created_at >= interval '3 days' and now() - created_at < interval '8 days'),
        'de8a15', count(*) filter (where now() - created_at >= interval '8 days' and now() - created_at < interval '16 days'),
        'mais15', count(*) filter (where now() - created_at >= interval '16 days')) from abertas),
    'evolucao', coalesce((select jsonb_agg(jsonb_build_object('ini', b.ini, 'fim', b.fim,
        'abertas', (select count(*) from os where (created_at at time zone v_fuso)::date between b.ini and b.fim),
        'concluidas', (select count(*) from os where status = 'concluida' and (completed_at at time zone v_fuso)::date between b.ini and b.fim),
        'sla_total', (select count(*) from os where status = 'concluida' and prazo_solucao is not null and (completed_at at time zone v_fuso)::date between b.ini and b.fim),
        'sla_ok', (select count(*) from os where status = 'concluida' and prazo_solucao is not null and sit = 'cumprido' and (completed_at at time zone v_fuso)::date between b.ini and b.fim)
      ) order by b.ini) from baldes b), '[]'::jsonb),
    'equipe', coalesce((select jsonb_agg(x order by x->>'nome') from (
        select jsonb_build_object('id', u.id, 'nome', u.name,
          'carga', (select count(*) from abertas a where a.technician_id = u.id),
          'concluidas', count(c.id),
          'sla_total', count(c.id) filter (where c.prazo_solucao is not null),
          'sla_ok', count(c.id) filter (where c.sit = 'cumprido'),
          'mttr_min', round(avg(c.tempo_solucao_min)),
          'inc_total', count(c.id) filter (where c.tipo = 'incidente'),
          'inc_primeira', count(c.id) filter (where c.tipo = 'incidente' and public.fn_primeira_visita(c.id))) x
        from public.users u
        left join os c on c.technician_id = u.id and c.status = 'concluida' and c.completed_at >= v_ini and c.completed_at < v_fim
        where u.tenant_id = v_tenant and u.role = 'tecnico' and coalesce(u.active, true)
          and (p->>'tecnico' is null or u.id = (p->>'tecnico')::uuid)
        group by u.id, u.name) t), '[]'::jsonb),
    'clientes', coalesce((select jsonb_agg(x order by (x->>'volume')::int desc, x->>'nome') from (
        select jsonb_build_object('id', cl.id, 'nome', cl.name,
          'volume', count(o.id) filter (where o.created_at >= v_ini and o.created_at < v_fim),
          'concluidas', count(o.id) filter (where o.status = 'concluida' and o.completed_at >= v_ini and o.completed_at < v_fim),
          'sla_total', count(o.id) filter (where o.status = 'concluida' and o.prazo_solucao is not null and o.completed_at >= v_ini and o.completed_at < v_fim),
          'sla_ok', count(o.id) filter (where o.sit = 'cumprido' and o.completed_at >= v_ini and o.completed_at < v_fim),
          'unidades_reincidentes', (select count(*) from (select o2.location_id from os o2 where o2.client_id = cl.id and o2.tipo = 'incidente'
               and o2.location_id is not null and o2.created_at >= v_ini and o2.created_at < v_fim group by o2.location_id having count(*) >= 2) z)) x
        from public.clients cl join os o on o.client_id = cl.id
        where cl.tenant_id = v_tenant
        group by cl.id, cl.name
        having count(o.id) filter (where o.created_at >= v_ini and o.created_at < v_fim) > 0
           or count(o.id) filter (where o.status = 'concluida' and o.completed_at >= v_ini and o.completed_at < v_fim) > 0
        order by count(o.id) filter (where o.created_at >= v_ini and o.created_at < v_fim) desc limit 10) t), '[]'::jsonb),
    'reincidencias', coalesce((select jsonb_agg(x order by (x->>'qtd')::int desc) from (
        select jsonb_build_object('unidade', l.name, 'cliente', cl.name, 'location_id', l.id, 'qtd', count(*)) x
        from os o join public.locations l on l.id = o.location_id join public.clients cl on cl.id = o.client_id
        where o.tipo = 'incidente' and o.created_at >= v_ini and o.created_at < v_fim
        group by l.id, l.name, cl.name having count(*) >= 2 order by count(*) desc limit 5) t), '[]'::jsonb),
    'preventivas', jsonb_build_object(
      'ck_devidos', (select count(*) from ck where data_prevista between v_de and least(v_ate, v_hoje)),
      'ck_no_prazo', (select count(*) from ck where data_prevista between v_de and least(v_ate, v_hoje) and status = 'concluido'
                       and (completed_at at time zone v_fuso)::date <= coalesce(prazo, data_prevista)),
      'ck_atrasados', (select count(*) from ck where data_prevista between v_de and least(v_ate, v_hoje) and status <> 'concluido' and coalesce(prazo, data_prevista) < v_hoje),
      'os_preventivas', (select count(*) from os where tipo = 'preventiva' and created_at >= v_ini and created_at < v_fim),
      'checklists', (select count(*) from ck where data_prevista between v_de and v_ate),
      'corretivas', (select count(*) from os where tipo = 'incidente' and created_at >= v_ini and created_at < v_fim))
  ) into r;
  return r;
end $$;

-- Lista de OS (044) aceitando várias prioridades (atalho "Crítico e Alto" do painel)
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
      and (p->>'de' is null or (o.created_at at time zone v_fuso)::date >= (p->>'de')::date)
      and (p->>'ate' is null or (o.created_at at time zone v_fuso)::date <= (p->>'ate')::date)
      and (p->>'cliente' is null or o.client_id = (p->>'cliente')::uuid)
      and (p->>'unidade' is null or o.location_id = (p->>'unidade')::uuid)
      and (p->>'prioridade' is null or o.priority = any(string_to_array(p->>'prioridade', ',')))   -- aceita lista (ex.: critico,alto)
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
          'categoria', (select jsonb_build_object('id', c.id, 'nome', c.nome, 'pai', (select p2.nome from public.os_categorias p2 where p2.id = c.pai_id)) from public.os_categorias c where c.id = g.categoria_id))
      order by g.ord) from pagina g), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
