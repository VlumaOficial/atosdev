-- ============================================================
-- ATOS — Migration 044: SLA no padrão ITSM (etapa A — banco)
-- ============================================================
-- Decisões do usuário (2026-09-25, VISAO_ATOS.md "SLA no padrão ITSM"):
--   * Tipos de OS: Incidente, Requisição, Preventiva, Visita
--   * Nível (prioridade): Incidente → Crítico/Alto/Baixo pela matriz
--     Impacto × Urgência (ou modo simples, escolha direta); Preventiva →
--     "preventiva"; Requisição → "requisicao"; Visita → sem SLA
--   * Catálogo de serviços (categoria › subcategoria) criado pela própria
--     empresa — sem modelos prontos
--   * Metas por nível: resposta (opcional, até designar técnico),
--     atendimento (até INICIAR) e solução (até CONCLUIR), em horas úteis
--     do horário de atendimento (Calendários) e feriados da cidade da
--     unidade. Exceções por cliente e/ou categoria (a mais específica
--     vence: cliente+categoria → cliente → categoria → nível). SLA por
--     cliente pode ser bloqueado por plano no futuro (tenants.sla_por_cliente)
--   * Motivos de pausa configuráveis: param ou não o relógio
--   * Agendamento a pedido do cliente vira o novo prazo combinado
--   * Alerta "em risco" (padrão 75%, ajustável); SEM justificativa
--     obrigatória ao estourar
-- Os prazos ficam gravados na OS (calculados por gatilho) — lista,
-- painel e alertas só comparam datas, sem recalcular horas úteis.
-- A prioridade antiga é convertida: urgente→critico, alta→alto, normal→baixo.
-- ============================================================

-- ---------- configuração da empresa ----------
alter table public.tenants add column if not exists sla_risco_pct int not null default 75 check (sla_risco_pct between 50 and 95);
alter table public.tenants add column if not exists prioridade_modo text not null default 'matriz' check (prioridade_modo in ('matriz', 'simples'));
alter table public.tenants add column if not exists prioridade_matriz jsonb not null default
  '{"alto":{"alta":"critico","media":"alto","baixa":"alto"},"medio":{"alta":"alto","media":"alto","baixa":"baixo"},"baixo":{"alta":"alto","media":"baixo","baixa":"baixo"}}'::jsonb;
alter table public.tenants add column if not exists sla_por_cliente boolean not null default true;   -- F8 pode bloquear por plano

create or replace function public.fn_matriz_valida(m jsonb)
returns boolean language sql immutable as $$
  select coalesce(bool_and(m -> i ->> u in ('critico', 'alto', 'baixo')), false)
  from unnest(array['alto', 'medio', 'baixo']) i, unnest(array['alta', 'media', 'baixa']) u
$$;
alter table public.tenants drop constraint if exists tenants_prioridade_matriz_check;
alter table public.tenants add constraint tenants_prioridade_matriz_check check (public.fn_matriz_valida(prioridade_matriz));

create or replace function public.salvar_config_prioridade(p_modo text, p_matriz jsonb, p_risco int)
returns void language plpgsql security definer as $$
declare v_tenant uuid := public.get_meu_tenant(); v_risco_mudou boolean;
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  if p_modo not in ('matriz', 'simples') then raise exception 'Modo inválido'; end if;
  if not public.fn_matriz_valida(p_matriz) then raise exception 'Matriz inválida'; end if;
  if p_risco not between 50 and 95 then raise exception 'O alerta de risco precisa ficar entre 50%% e 95%%'; end if;
  select sla_risco_pct <> p_risco into v_risco_mudou from public.tenants where id = v_tenant;
  update public.tenants set prioridade_modo = p_modo, prioridade_matriz = p_matriz, sla_risco_pct = p_risco where id = v_tenant;
  -- novo percentual de risco vale para as OS em aberto
  if v_risco_mudou then
    update public.orders set sla_recalcular = true
    where tenant_id = v_tenant and status not in ('concluida', 'cancelada') and sla_politica_id is not null;
  end if;
end $$;

-- ---------- catálogo ----------
create table if not exists public.os_categorias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  pai_id uuid references public.os_categorias(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  impacto text check (impacto in ('alto', 'medio', 'baixo')),
  urgencia text check (urgencia in ('alta', 'media', 'baixa')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists os_categorias_nome_uk on public.os_categorias
  (tenant_id, coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(nome)));
-- só dois níveis: subcategoria não tem filha
create or replace function public.fn_os_categoria_nivel()
returns trigger language plpgsql as $$
begin
  if new.pai_id is not null and exists (select 1 from public.os_categorias where id = new.pai_id and pai_id is not null) then
    raise exception 'Subcategoria não pode ter subcategoria (use até dois níveis).';
  end if;
  if new.pai_id is not null and not exists (select 1 from public.os_categorias where id = new.pai_id and tenant_id = new.tenant_id) then
    raise exception 'Categoria não encontrada.';
  end if;
  return new;
end $$;
drop trigger if exists trg_os_categoria_nivel on public.os_categorias;
create trigger trg_os_categoria_nivel before insert or update on public.os_categorias
  for each row execute function public.fn_os_categoria_nivel();

alter table public.os_categorias enable row level security;
drop policy if exists os_categorias_select on public.os_categorias;
create policy os_categorias_select on public.os_categorias for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
drop policy if exists os_categorias_write on public.os_categorias;
create policy os_categorias_write on public.os_categorias for all
  using (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'))
  with check (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'));

-- ---------- motivos de pausa ----------
create table if not exists public.motivos_pausa (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  para_sla boolean not null default false,
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create unique index if not exists motivos_pausa_nome_uk on public.motivos_pausa (tenant_id, lower(trim(nome)));
alter table public.motivos_pausa enable row level security;
drop policy if exists motivos_pausa_select on public.motivos_pausa;
create policy motivos_pausa_select on public.motivos_pausa for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
drop policy if exists motivos_pausa_write on public.motivos_pausa;
create policy motivos_pausa_write on public.motivos_pausa for all
  using (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'))
  with check (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'));

-- motivos iniciais (a empresa edita): todo tenant nasce com eles
create or replace function public.fn_motivos_pausa_padrao(p_tenant uuid)
returns void language sql security definer as $$
  insert into public.motivos_pausa (tenant_id, nome, para_sla, ordem) values
    (p_tenant, 'Aguardando o cliente', true, 1),
    (p_tenant, 'Acesso não liberado pelo cliente', true, 2),
    (p_tenant, 'Aguardando peça ou material', false, 3),
    (p_tenant, 'Outro', false, 9)
  on conflict do nothing
$$;
create or replace function public.fn_tenant_motivos_pausa()
returns trigger language plpgsql security definer as $$
begin perform public.fn_motivos_pausa_padrao(new.id); return new; end $$;
drop trigger if exists trg_tenant_motivos_pausa on public.tenants;
create trigger trg_tenant_motivos_pausa after insert on public.tenants
  for each row execute function public.fn_tenant_motivos_pausa();
select public.fn_motivos_pausa_padrao(id) from public.tenants;

-- ---------- políticas de SLA ----------
create table if not exists public.sla_politicas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  nivel text not null check (nivel in ('critico', 'alto', 'baixo', 'preventiva', 'requisicao')),
  client_id uuid references public.clients(id) on delete cascade,
  categoria_id uuid references public.os_categorias(id) on delete cascade,
  horario_id uuid references public.horarios_atendimento(id) on delete set null,   -- null = horário padrão da empresa
  resposta_min int check (resposta_min > 0),
  atendimento_min int not null check (atendimento_min > 0),
  solucao_min int not null check (solucao_min > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (solucao_min >= atendimento_min),
  check (resposta_min is null or resposta_min <= atendimento_min)
);
create unique index if not exists sla_politicas_uk on public.sla_politicas (tenant_id, nivel,
  coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(categoria_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.sla_politicas enable row level security;
drop policy if exists sla_politicas_select on public.sla_politicas;
create policy sla_politicas_select on public.sla_politicas for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
drop policy if exists sla_politicas_write on public.sla_politicas;
create policy sla_politicas_write on public.sla_politicas for all
  using (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'))
  with check (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor')
    and (client_id is null or (select sla_por_cliente from public.tenants where id = public.get_meu_tenant())));

-- ---------- OS ----------
alter table public.orders add column if not exists tipo text not null default 'incidente'
  check (tipo in ('incidente', 'requisicao', 'preventiva', 'visita'));
alter table public.orders add column if not exists categoria_id uuid references public.os_categorias(id) on delete set null;
alter table public.orders add column if not exists impacto text check (impacto in ('alto', 'medio', 'baixo'));
alter table public.orders add column if not exists urgencia text check (urgencia in ('alta', 'media', 'baixa'));
alter table public.orders add column if not exists pause_motivo_id uuid references public.motivos_pausa(id) on delete set null;
alter table public.orders add column if not exists agendado_pelo_cliente boolean not null default false;
-- SLA gravado (calculado pelo gatilho)
alter table public.orders add column if not exists sla_politica_id uuid references public.sla_politicas(id) on delete set null;
alter table public.orders add column if not exists sla_horario_id uuid;
alter table public.orders add column if not exists sla_base timestamptz;              -- início da contagem (abertura ou data combinada)
alter table public.orders add column if not exists prazo_resposta timestamptz;
alter table public.orders add column if not exists prazo_atendimento timestamptz;
alter table public.orders add column if not exists prazo_solucao timestamptz;
alter table public.orders add column if not exists risco_atendimento timestamptz;      -- ponto de "em risco" (% da empresa)
alter table public.orders add column if not exists risco_solucao timestamptz;
alter table public.orders add column if not exists respondido_em timestamptz;          -- 1ª vez com técnico
alter table public.orders add column if not exists atendido_em timestamptz;            -- 1º início (started_at é sobrescrito ao retomar)
alter table public.orders add column if not exists sla_pausado_desde timestamptz;
alter table public.orders add column if not exists sla_pausa_min int not null default 0;
alter table public.orders add column if not exists sla_atendimento_ok boolean;
alter table public.orders add column if not exists sla_solucao_ok boolean;
alter table public.orders add column if not exists sla_resposta_ok boolean;
alter table public.orders add column if not exists sla_recalcular boolean not null default false;

-- prioridade antiga → nova
update public.orders set priority = case priority when 'urgente' then 'critico' when 'alta' then 'alto' when 'normal' then 'baixo' else priority end
where priority in ('urgente', 'alta', 'normal');
alter table public.orders alter column priority set default 'baixo';
alter table public.orders drop constraint if exists orders_priority_check;
alter table public.orders add constraint orders_priority_check check (priority in ('critico', 'alto', 'baixo', 'preventiva', 'requisicao', 'visita'));
-- histórico: OS antigas registram o 1º início e a 1ª atribuição
update public.orders set atendido_em = started_at where atendido_em is null and started_at is not null;
update public.orders set respondido_em = created_at where respondido_em is null and technician_id is not null;

-- política aplicável (mais específica vence)
create or replace function public.sla_politica_para(p_tenant uuid, p_nivel text, p_client uuid, p_categoria uuid)
returns public.sla_politicas language sql stable security definer as $$
  select p.* from public.sla_politicas p
  left join public.os_categorias c on c.id = p_categoria
  where p.tenant_id = p_tenant and p.nivel = p_nivel and p.ativo
    and (p.client_id is null or (p.client_id = p_client and (select sla_por_cliente from public.tenants where id = p_tenant)))
    and (p.categoria_id is null or p.categoria_id = p_categoria or p.categoria_id = c.pai_id)
  order by (p.client_id is not null) desc, (p.categoria_id = p_categoria) desc nulls last, (p.categoria_id is not null) desc
  limit 1
$$;

create or replace function public.fn_orders_sla()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_t public.tenants; v_pol public.sla_politicas; v_h uuid; v_ibge text; v_min int;
  v_recalc boolean := false; v_agora timestamptz := now(); v_para boolean;
begin
  select * into v_t from public.tenants where id = new.tenant_id;

  -- compatibilidade: valores antigos de prioridade (telas anteriores)
  new.priority := case new.priority when 'urgente' then 'critico' when 'alta' then 'alto' when 'normal' then 'baixo' else new.priority end;
  -- nível pelo tipo (Incidente: matriz Impacto × Urgência ou escolha direta)
  if new.tipo = 'incidente' then
    if v_t.prioridade_modo = 'matriz' and new.impacto is not null and new.urgencia is not null then
      new.priority := v_t.prioridade_matriz -> new.impacto ->> new.urgencia;
    end if;
    if new.priority not in ('critico', 'alto', 'baixo') then new.priority := 'baixo'; end if;
  else
    new.priority := new.tipo;
  end if;

  -- marcos
  if new.technician_id is not null and new.respondido_em is null then new.respondido_em := v_agora; end if;
  if new.status = 'em_andamento' and new.atendido_em is null then new.atendido_em := coalesce(new.started_at, v_agora); end if;

  if tg_op = 'INSERT' then
    new.sla_base := coalesce(new.created_at, v_agora);
    v_recalc := true;
  else
    -- pausa: entra (motivo que para o relógio) / sai
    if new.status = 'pausada' and old.status <> 'pausada' then
      select para_sla into v_para from public.motivos_pausa where id = new.pause_motivo_id;
      if coalesce(v_para, false) then new.sla_pausado_desde := v_agora; end if;
    end if;
    if old.status = 'pausada' and new.status <> 'pausada' and old.sla_pausado_desde is not null then
      if new.sla_horario_id is not null then
        new.sla_pausa_min := new.sla_pausa_min + coalesce((extract(epoch from public.horas_uteis_entre(new.sla_horario_id, old.sla_pausado_desde, v_agora, (select cidade_ibge from public.locations where id = new.location_id))) / 60)::int, 0);
      end if;
      new.sla_pausado_desde := null;
      v_recalc := true;
    end if;
    -- agendamento combinado com o cliente: a data agendada vira o prazo
    if new.status = 'agendada' and new.agendado_pelo_cliente and new.scheduled_at is not null
       and (old.status <> 'agendada' or new.scheduled_at is distinct from old.scheduled_at or not old.agendado_pelo_cliente) then
      new.sla_base := new.scheduled_at;
      v_recalc := true;
    end if;
    if new.tipo is distinct from old.tipo or new.priority is distinct from old.priority or new.categoria_id is distinct from old.categoria_id
       or new.client_id is distinct from old.client_id or new.location_id is distinct from old.location_id or new.sla_recalcular then
      v_recalc := true;
    end if;
  end if;

  if v_recalc then
    new.sla_recalcular := false;
    new.sla_base := coalesce(new.sla_base, new.created_at, v_agora);   -- OS anteriores ao SLA
    v_pol := null;
    if new.priority <> 'visita' then
      v_pol := public.sla_politica_para(new.tenant_id, new.priority, new.client_id, new.categoria_id);
    end if;
    if v_pol.id is null then
      new.sla_politica_id := null; new.sla_horario_id := null;
      new.prazo_resposta := null; new.prazo_atendimento := null; new.prazo_solucao := null;
      new.risco_atendimento := null; new.risco_solucao := null;
    else
      v_h := coalesce(v_pol.horario_id, public.horario_padrao(new.tenant_id));
      select cidade_ibge into v_ibge from public.locations where id = new.location_id;
      new.sla_politica_id := v_pol.id; new.sla_horario_id := v_h;
      if new.agendado_pelo_cliente and new.sla_base is not null and new.sla_base <> coalesce(new.created_at, v_agora) then
        -- combinado: atendimento na data agendada; solução mantém a folga (solução − atendimento)
        new.prazo_resposta := null;
        new.prazo_atendimento := new.sla_base;
        new.risco_atendimento := new.sla_base;
        v_min := v_pol.solucao_min - v_pol.atendimento_min + new.sla_pausa_min;
        new.prazo_solucao := public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => v_min), v_ibge);
        new.risco_solucao := public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => (v_min * v_t.sla_risco_pct / 100)), v_ibge);
      else
        new.prazo_resposta := case when v_pol.resposta_min is null then null
          else public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => v_pol.resposta_min), v_ibge) end;
        new.prazo_atendimento := public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => v_pol.atendimento_min), v_ibge);
        new.risco_atendimento := public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => (v_pol.atendimento_min * v_t.sla_risco_pct / 100)), v_ibge);
        new.prazo_solucao := public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => v_pol.solucao_min + new.sla_pausa_min), v_ibge);
        new.risco_solucao := public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => ((v_pol.solucao_min * v_t.sla_risco_pct / 100) + new.sla_pausa_min)), v_ibge);
      end if;
    end if;
  end if;

  -- resultado ao concluir; reabrir limpa
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status <> 'concluida') then
    if new.sla_pausado_desde is not null then new.sla_pausado_desde := null; end if;
    new.sla_resposta_ok := case when new.prazo_resposta is null then null else coalesce(new.respondido_em, new.completed_at) <= new.prazo_resposta end;
    new.sla_atendimento_ok := case when new.prazo_atendimento is null then null else coalesce(new.atendido_em, new.completed_at) <= new.prazo_atendimento end;
    new.sla_solucao_ok := case when new.prazo_solucao is null then null else coalesce(new.completed_at, v_agora) <= new.prazo_solucao end;
  elsif tg_op = 'UPDATE' and old.status = 'concluida' and new.status <> 'concluida' then
    new.sla_resposta_ok := null; new.sla_atendimento_ok := null; new.sla_solucao_ok := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_sla on public.orders;
create trigger trg_orders_sla before insert or update on public.orders
  for each row execute function public.fn_orders_sla();

-- Situação do SLA agora (mesma regra da tela — src/lib/sla.ts)
create or replace function public.sla_situacao(o public.orders)
returns text language sql stable as $$
  select case
    when o.prazo_solucao is null then 'sem_sla'
    when o.status = 'cancelada' then 'cancelada'
    when o.status = 'concluida' then case when coalesce(o.sla_solucao_ok, true) and coalesce(o.sla_atendimento_ok, true) and coalesce(o.sla_resposta_ok, true) then 'cumprido' else 'violado' end
    when o.sla_pausado_desde is not null then 'pausado'
    when (o.prazo_resposta is not null and coalesce(o.respondido_em, now()) > o.prazo_resposta)
      or coalesce(o.atendido_em, now()) > o.prazo_atendimento or now() > o.prazo_solucao then 'vencido'
    when (o.atendido_em is null and now() > o.risco_atendimento) or now() > o.risco_solucao then 'em_risco'
    else 'no_prazo' end
$$;

-- Prévia para o formulário / tela de configuração: "se abrir agora, vence em…"
create or replace function public.previa_sla(p_tipo text, p_impacto text, p_urgencia text, p_prioridade text,
  p_client uuid, p_categoria uuid, p_location uuid, p_inicio timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t public.tenants; v_nivel text; v_pol public.sla_politicas; v_h uuid; v_ibge text;
begin
  select * into v_t from public.tenants where id = public.get_meu_tenant();
  if v_t.id is null then return null; end if;
  if p_tipo = 'incidente' then
    v_nivel := case when v_t.prioridade_modo = 'matriz' and p_impacto is not null and p_urgencia is not null
                    then v_t.prioridade_matriz -> p_impacto ->> p_urgencia else coalesce(nullif(p_prioridade, ''), 'baixo') end;
    if v_nivel not in ('critico', 'alto', 'baixo') then v_nivel := 'baixo'; end if;
  else v_nivel := p_tipo; end if;
  if v_nivel = 'visita' then return jsonb_build_object('nivel', v_nivel, 'sla', false); end if;
  v_pol := public.sla_politica_para(v_t.id, v_nivel, p_client, p_categoria);
  if v_pol.id is null then return jsonb_build_object('nivel', v_nivel, 'sla', false); end if;
  v_h := coalesce(v_pol.horario_id, public.horario_padrao(v_t.id));
  select cidade_ibge into v_ibge from public.locations where id = p_location;
  return jsonb_build_object('nivel', v_nivel, 'sla', true, 'politica', v_pol.id,
    'excecao', v_pol.client_id is not null or v_pol.categoria_id is not null,
    'resposta', case when v_pol.resposta_min is null then null else public.somar_horas_uteis(v_h, p_inicio, make_interval(mins => v_pol.resposta_min), v_ibge) end,
    'atendimento', public.somar_horas_uteis(v_h, p_inicio, make_interval(mins => v_pol.atendimento_min), v_ibge),
    'solucao', public.somar_horas_uteis(v_h, p_inicio, make_interval(mins => v_pol.solucao_min), v_ibge));
end $$;


-- Lista de OS (migration 041) com tipo, categoria e SLA: filtros, contagens de
-- vencidos/em risco e "Em aberto" ordenada pelo vencimento
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
      and (p->>'prioridade' is null or o.priority = p->>'prioridade')
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
