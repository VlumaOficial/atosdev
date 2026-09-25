-- ============================================================
-- ATOS — Migration 038: recorrência dos checklists avulsos
-- ============================================================
-- Desenho aprovado pelo usuário (2026-09-25, VISAO_ATOS.md F5):
--   * campo "Repetir" com atalhos + "Personalizar..." (estilo Outlook):
--     diária (a cada N dias / todo dia útil), semanal (dias da semana,
--     a cada N semanas), mensal (dia N, Nª <dia da semana>, último dia,
--     última <dia>), anual; término nunca / após N / em data; prazo
--   * dia 29/30/31 em mês curto → último dia do mês (decisão da equipe)
--   * fim de semana/feriado: só aviso na prévia (datas não mudam),
--     exceto "Todo dia útil", que segue o horário de atendimento padrão
--     e os feriados da cidade da unidade (migration 035)
--   * SÉRIE separada das OCORRÊNCIAS: cada ocorrência é um
--     checklist_instance normal (preenchimento, fotos, histórico iguais)
--   * geração pelo banco (pg_cron, de hora em hora): só as ocorrências
--     que entram na janela (antecedência, padrão 7 dias), sem gerar
--     centenas adiantadas; nunca gera datas anteriores à criação
--   * editar "esta e as seguintes" (a partir de uma data) e "só esta";
--     pausar/retomar/encerrar a série
-- A mesma função de datas alimenta a prévia da tela e a geração.
-- ============================================================

-- ---------- regra ----------
-- {"freq":"diaria","intervalo":1,"dias_uteis":false}
-- {"freq":"semanal","intervalo":1,"dias_semana":[1,3]}        0 = domingo
-- {"freq":"mensal","intervalo":1,"modo":"dia","dia_mes":10}   -1 = último dia
-- {"freq":"mensal","intervalo":1,"modo":"ordinal","ordinal":2,"dia_semana":2}  -1 = última
-- {"freq":"anual","intervalo":1,"mes":3,"dia":10}
create or replace function public.fn_regra_erro(r jsonb)
returns text language plpgsql immutable as $$
declare f text := r->>'freq'; i int;
begin
  if r is null or jsonb_typeof(r) <> 'object' then return 'Regra de repetição inválida'; end if;
  if f not in ('diaria', 'semanal', 'mensal', 'anual') then return 'Frequência inválida'; end if;
  i := coalesce((r->>'intervalo')::int, 0);
  if i < 1 or i > 99 then return 'O intervalo precisa ser de 1 a 99'; end if;
  if f = 'diaria' and coalesce((r->>'dias_uteis')::boolean, false) and i <> 1 then
    return '"Todo dia útil" não combina com intervalo'; end if;
  if f = 'semanal' then
    if jsonb_typeof(r->'dias_semana') <> 'array' or jsonb_array_length(r->'dias_semana') = 0 then
      return 'Escolha pelo menos um dia da semana'; end if;
    if exists (select 1 from jsonb_array_elements_text(r->'dias_semana') d where d !~ '^[0-6]$') then
      return 'Dia da semana inválido'; end if;
  end if;
  if f = 'mensal' then
    if r->>'modo' = 'dia' then
      if (r->>'dia_mes')::int not between 1 and 31 and (r->>'dia_mes')::int <> -1 then return 'Dia do mês inválido'; end if;
    elsif r->>'modo' = 'ordinal' then
      if (r->>'ordinal')::int not in (1, 2, 3, 4, -1) then return 'Ordem inválida (1ª a 4ª ou última)'; end if;
      if (r->>'dia_semana')::int not between 0 and 6 then return 'Dia da semana inválido'; end if;
    else return 'Modo mensal inválido'; end if;
  end if;
  if f = 'anual' then
    if (r->>'mes')::int not between 1 and 12 or (r->>'dia')::int not between 1 and 31 then return 'Data anual inválida'; end if;
  end if;
  return null;
exception when others then return 'Regra de repetição inválida';
end $$;

create or replace function public.fn_ultimo_dia(p_ano int, p_mes int)
returns date language sql immutable as $$
  select (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date
$$;

-- Datas da regra a partir de p_inicio, dentro de [p_de, p_ate] (sem
-- filtro de dia útil). Pura: a mesma usada na prévia e na geração.
create or replace function public.datas_da_regra(r jsonb, p_inicio date, p_de date, p_ate date)
returns setof date language plpgsql immutable as $$
declare
  f text := r->>'freq'; i int := greatest(coalesce((r->>'intervalo')::int, 1), 1);
  d date; k int; w date; semana0 date; m int; a int; primeiro date; alvo int; dm int;
  dias int[];
begin
  if p_ate < p_de or p_ate < p_inicio then return; end if;
  if f = 'diaria' then
    k := greatest(0, ceil((greatest(p_de, p_inicio) - p_inicio)::numeric / i)::int);
    d := p_inicio + k * i;
    while d <= p_ate loop
      return next d; d := d + i;
    end loop;
  elsif f = 'semanal' then
    select array_agg(x::int order by x::int) into dias from jsonb_array_elements_text(r->'dias_semana') x;
    semana0 := p_inicio - extract(dow from p_inicio)::int;           -- domingo da semana inicial
    w := semana0 + (greatest(0, ((greatest(p_de, p_inicio) - semana0) / 7) / i) * i) * 7;
    while w <= p_ate loop
      foreach k in array dias loop
        d := w + k;
        if d >= p_inicio and d >= p_de and d <= p_ate then return next d; end if;
      end loop;
      w := w + 7 * i;
    end loop;
  elsif f = 'mensal' then
    m := 0;
    loop
      primeiro := (date_trunc('month', p_inicio) + make_interval(months => m))::date;
      exit when primeiro > p_ate;
      if primeiro >= date_trunc('month', p_de)::date - interval '1 month' then
        a := extract(year from primeiro)::int; k := extract(month from primeiro)::int;
        if r->>'modo' = 'dia' then
          dm := (r->>'dia_mes')::int;
          d := case when dm = -1 then public.fn_ultimo_dia(a, k)
                    else least(make_date(a, k, 1) + (dm - 1), public.fn_ultimo_dia(a, k)) end;
        else
          alvo := (r->>'dia_semana')::int;
          if (r->>'ordinal')::int = -1 then
            d := public.fn_ultimo_dia(a, k);
            d := d - ((extract(dow from d)::int - alvo + 7) % 7);
          else
            d := primeiro + ((alvo - extract(dow from primeiro)::int + 7) % 7) + ((r->>'ordinal')::int - 1) * 7;
          end if;
        end if;
        if d >= p_inicio and d >= p_de and d <= p_ate then return next d; end if;
      end if;
      m := m + i;
    end loop;
  elsif f = 'anual' then
    a := extract(year from p_inicio)::int;
    loop
      d := least(make_date(a, (r->>'mes')::int, 1) + ((r->>'dia')::int - 1), public.fn_ultimo_dia(a, (r->>'mes')::int));
      exit when d > p_ate;
      if d >= p_inicio and d >= p_de then return next d; end if;
      a := a + i;
    end loop;
  end if;
end $$;

-- ---------- séries ----------
create table if not exists public.checklist_series (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  template_id uuid not null references public.checklist_templates(id) on delete restrict,
  titulo text not null,
  client_id uuid references public.clients(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  tecnicos uuid[] not null default '{}',
  regra jsonb not null check (public.fn_regra_erro(regra) is null),
  resumo text not null,                 -- "Toda segunda e quarta" (montado pela tela)
  rrule text,                           -- mesma regra no padrão iCalendar (registro/exportação)
  inicio date not null,
  termino_tipo text not null default 'nunca' check (termino_tipo in ('nunca', 'apos', 'em')),
  termino_qtd int check (termino_qtd between 1 and 999),
  termino_data date,
  ocorrencias_anteriores int not null default 0,   -- já geradas antes de uma edição (conta no "após N")
  prazo_dias int not null default 1 check (prazo_dias between 1 and 60),
  antecedencia_dias int not null default 7 check (antecedencia_dias between 0 and 60),
  gerar_a_partir date not null,         -- nunca gera datas anteriores (criação/edição)
  gerado_ate date,                      -- fim da última janela processada (a próxima rodada começa depois)
  situacao text not null default 'ativa' check (situacao in ('ativa', 'pausada', 'encerrada')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (termino_tipo <> 'apos' or termino_qtd is not null),
  check (termino_tipo <> 'em' or (termino_data is not null and termino_data >= inicio))
);
create index if not exists checklist_series_tenant_idx on public.checklist_series (tenant_id);

alter table public.checklist_series enable row level security;
drop policy if exists checklist_series_select on public.checklist_series;
create policy checklist_series_select on public.checklist_series for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
-- escrita só pelas funções abaixo (validação + geração numa transação)

-- ---------- ocorrências ----------
alter table public.checklist_instances add column if not exists serie_id uuid references public.checklist_series(id) on delete set null;
alter table public.checklist_instances add column if not exists data_prevista date;
alter table public.checklist_instances add column if not exists prazo date;
create unique index if not exists checklist_instances_serie_data_uk on public.checklist_instances (serie_id, data_prevista) where serie_id is not null;
create index if not exists checklist_instances_data_idx on public.checklist_instances (tenant_id, data_prevista);

create or replace function public.fn_hoje_empresa(p_tenant uuid)
returns date language sql stable as $$
  select (now() at time zone coalesce((select fuso_horario from public.tenants where id = p_tenant), 'America/Sao_Paulo'))::date
$$;

-- Datas efetivas de uma série (regra + "todo dia útil" + término), numeradas.
-- Com término "após N" a contagem começa no início (precisa numerar);
-- sem ele, começa em p_de. p_max limita quantas devolver.
create or replace function public.datas_da_serie(
  r jsonb, p_inicio date, p_de date, p_ate date, p_tenant uuid, p_location uuid,
  p_termino_tipo text, p_termino_qtd int, p_termino_data date, p_anteriores int default 0, p_max int default null
) returns table (n int, data date) language plpgsql stable as $$
declare v_h uuid; v_ibge text; v_ate date := p_ate; v_n int := coalesce(p_anteriores, 0); v_saidas int := 0; d date;
  v_de date := case when p_termino_tipo = 'apos' then p_inicio else greatest(p_inicio, coalesce(p_de, p_inicio)) end;
begin
  if p_termino_tipo = 'em' then v_ate := least(v_ate, p_termino_data); end if;
  if coalesce((r->>'dias_uteis')::boolean, false) then
    select id into v_h from public.horarios_atendimento where tenant_id = p_tenant and padrao;
    select cidade_ibge into v_ibge from public.locations where id = p_location;
  end if;
  for d in select * from public.datas_da_regra(r, p_inicio, v_de, v_ate) loop
    if v_h is not null and not public.eh_dia_util(v_h, d, v_ibge) then continue; end if;
    v_n := v_n + 1;
    if p_termino_tipo = 'apos' and v_n > p_termino_qtd then return; end if;
    continue when d < coalesce(p_de, p_inicio);
    n := v_n; data := d; return next;
    v_saidas := v_saidas + 1;
    if p_max is not null and v_saidas >= p_max then return; end if;
  end loop;
end $$;

-- Prévia para a tela: próximas datas + se caem fora do expediente
create or replace function public.previa_recorrencia(
  p_regra jsonb, p_inicio date, p_location uuid default null,
  p_termino_tipo text default 'nunca', p_termino_qtd int default null, p_termino_data date default null,
  p_qtd int default 5
) returns table (data date, dia_util boolean, motivo text) language plpgsql stable as $$
declare v_tenant uuid := public.get_meu_tenant(); v_h uuid; v_ibge text; e text; r record; v_s jsonb;
begin
  e := public.fn_regra_erro(p_regra);
  if e is not null then raise exception '%', e; end if;
  select id into v_h from public.horarios_atendimento where tenant_id = v_tenant and padrao;
  select cidade_ibge into v_ibge from public.locations where id = p_location;
  for r in select * from public.datas_da_serie(p_regra, p_inicio, p_inicio, p_inicio + 3660, v_tenant, p_location,
                                                 p_termino_tipo, p_termino_qtd, p_termino_data, 0, greatest(1, least(p_qtd, 20))) loop
    data := r.data;
    dia_util := v_h is null or public.eh_dia_util(v_h, r.data, v_ibge);
    motivo := null;
    if not dia_util then
      select string_agg(f.nome, ', ') into motivo from public.feriados_do_dia(v_tenant, r.data, v_ibge) f where f.efeito = 'folga';
      motivo := coalesce(motivo, case extract(dow from r.data)::int when 0 then 'Domingo' when 6 then 'Sábado' else 'Sem expediente' end);
    end if;
    return next;
  end loop;
end $$;

-- Gera as ocorrências que entraram na janela. Idempotente.
create or replace function public.gerar_ocorrencias(p_serie uuid default null)
returns int language plpgsql security definer as $$
declare s public.checklist_series; d record; v_hoje date; v_ate date; v_id uuid; v_total int := 0; t uuid; v_ultima date;
begin
  for s in select * from public.checklist_series
           where situacao = 'ativa' and (p_serie is null or id = p_serie) loop
    v_hoje := public.fn_hoje_empresa(s.tenant_id);
    v_ate := v_hoje + s.antecedencia_dias;
    for d in select * from public.datas_da_serie(s.regra, s.inicio, greatest(s.gerar_a_partir, coalesce(s.gerado_ate + 1, s.gerar_a_partir)),
                                                 v_ate, s.tenant_id, s.location_id, s.termino_tipo, s.termino_qtd, s.termino_data,
                                                 s.ocorrencias_anteriores) loop
      v_id := null;
      insert into public.checklist_instances (tenant_id, template_id, title_snapshot, context_type, client_id, location_id,
        recurrence, status, created_by, serie_id, data_prevista, prazo)
      values (s.tenant_id, s.template_id, s.titulo, 'avulso', s.client_id, s.location_id,
        s.resumo, 'pendente', s.criado_por, s.id, d.data, d.data + (s.prazo_dias - 1))
      on conflict (serie_id, data_prevista) where serie_id is not null do nothing
      returning id into v_id;
      if v_id is not null then
        foreach t in array s.tecnicos loop
          insert into public.checklist_instance_targets (tenant_id, instance_id, technician_id) values (s.tenant_id, v_id, t);
        end loop;
        v_total := v_total + 1;
      end if;
    end loop;
    -- série termina quando a última ocorrência já passou
    v_ultima := null;
    if s.termino_tipo = 'em' then v_ultima := s.termino_data;
    elsif s.termino_tipo = 'apos' then
      select x.data into v_ultima from public.datas_da_serie(s.regra, s.inicio, s.inicio, s.inicio + 36600, s.tenant_id, s.location_id,
        s.termino_tipo, s.termino_qtd, s.termino_data, s.ocorrencias_anteriores) x order by x.n desc limit 1;
    end if;
    update public.checklist_series set gerado_ate = greatest(coalesce(gerado_ate, v_ate), v_ate),
      situacao = case when v_ultima is not null and v_ultima < v_hoje then 'encerrada' else situacao end
    where id = s.id;
  end loop;
  return v_total;
end $$;
revoke execute on function public.gerar_ocorrencias(uuid) from public, anon, authenticated;

-- Remove ocorrências futuras ainda não iniciadas (sem respostas) a partir de uma data
create or replace function public.fn_remover_futuras(p_serie uuid, p_a_partir date)
returns int language plpgsql security definer as $$
declare v_n int;
begin
  delete from public.checklist_instances i
  where i.serie_id = p_serie and i.data_prevista >= p_a_partir and i.status = 'pendente'
    and not exists (select 1 from public.checklist_answers a where a.instance_id = i.id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.fn_remover_futuras(uuid, date) from public, anon, authenticated;

-- Criar (p_id null) ou alterar "esta e as seguintes" (p_a_partir)
create or replace function public.salvar_serie(
  p_id uuid, p_template uuid, p_titulo text, p_client uuid, p_location uuid, p_tecnicos uuid[],
  p_regra jsonb, p_resumo text, p_rrule text, p_inicio date,
  p_termino_tipo text, p_termino_qtd int, p_termino_data date, p_prazo_dias int,
  p_a_partir date default null
) returns uuid language plpgsql security definer as $$
declare v_tenant uuid := public.get_meu_tenant(); v_id uuid := p_id; v_hoje date; e text; s public.checklist_series; v_ant int;
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  if nullif(trim(coalesce(p_titulo, '')), '') is null then raise exception 'O título é obrigatório.'; end if;
  e := public.fn_regra_erro(p_regra);
  if e is not null then raise exception '%', e; end if;
  if not exists (select 1 from public.checklist_templates where id = p_template and tenant_id = v_tenant) then
    raise exception 'Modelo de checklist não encontrado.'; end if;
  if p_client is not null and not exists (select 1 from public.clients where id = p_client and tenant_id = v_tenant) then
    raise exception 'Cliente não encontrado.'; end if;
  if p_location is not null and not exists (select 1 from public.locations where id = p_location and tenant_id = v_tenant) then
    raise exception 'Unidade não encontrada.'; end if;
  if exists (select 1 from unnest(coalesce(p_tecnicos, '{}')) t
             where not exists (select 1 from public.users u where u.id = t and u.tenant_id = v_tenant)) then
    raise exception 'Técnico não encontrado.'; end if;
  if p_termino_tipo = 'em' and (p_termino_data is null or p_termino_data < p_inicio) then
    raise exception 'A data de término precisa ser depois do início.'; end if;
  v_hoje := public.fn_hoje_empresa(v_tenant);

  if v_id is null then
    insert into public.checklist_series (tenant_id, template_id, titulo, client_id, location_id, tecnicos, regra, resumo, rrule,
      inicio, termino_tipo, termino_qtd, termino_data, prazo_dias, gerar_a_partir)
    values (v_tenant, p_template, trim(p_titulo), p_client, p_location, coalesce(p_tecnicos, '{}'), p_regra, p_resumo, p_rrule,
      p_inicio, p_termino_tipo, p_termino_qtd, p_termino_data, coalesce(p_prazo_dias, 1), greatest(p_inicio, v_hoje))
    returning id into v_id;
  else
    select * into s from public.checklist_series where id = v_id and tenant_id = v_tenant for update;
    if not found then raise exception 'Série não encontrada.'; end if;
    -- "esta e as seguintes": a partir de p_a_partir (padrão hoje); o que já passou fica como está
    p_a_partir := greatest(coalesce(p_a_partir, v_hoje), v_hoje);
    perform public.fn_remover_futuras(v_id, p_a_partir);
    select count(*) into v_ant from public.checklist_instances where serie_id = v_id and data_prevista < p_a_partir;
    update public.checklist_series set template_id = p_template, titulo = trim(p_titulo), client_id = p_client,
      location_id = p_location, tecnicos = coalesce(p_tecnicos, '{}'), regra = p_regra, resumo = p_resumo, rrule = p_rrule,
      inicio = greatest(p_inicio, p_a_partir), termino_tipo = p_termino_tipo, termino_qtd = p_termino_qtd,
      termino_data = p_termino_data, prazo_dias = coalesce(p_prazo_dias, 1), gerar_a_partir = p_a_partir,
      ocorrencias_anteriores = v_ant, gerado_ate = null, situacao = case when situacao = 'encerrada' then 'ativa' else situacao end,
      atualizado_em = now()
    where id = v_id;
  end if;
  perform public.gerar_ocorrencias(v_id);
  return v_id;
end $$;

-- pausar / retomar / encerrar
create or replace function public.definir_situacao_serie(p_id uuid, p_situacao text)
returns void language plpgsql security definer as $$
declare v_tenant uuid := public.get_meu_tenant(); v_hoje date := public.fn_hoje_empresa(public.get_meu_tenant());
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  if p_situacao not in ('ativa', 'pausada', 'encerrada') then raise exception 'Situação inválida'; end if;
  update public.checklist_series set situacao = p_situacao, atualizado_em = now(),
    gerar_a_partir = case when p_situacao = 'ativa' then greatest(gerar_a_partir, v_hoje) else gerar_a_partir end,
    gerado_ate = case when p_situacao = 'ativa' then null else gerado_ate end
  where id = p_id and tenant_id = v_tenant;
  if not found then raise exception 'Série não encontrada.'; end if;
  -- pausar/encerrar: some a fila futura ainda não iniciada (de amanhã em diante)
  if p_situacao <> 'ativa' then perform public.fn_remover_futuras(p_id, v_hoje + 1); end if;
  if p_situacao = 'ativa' then perform public.gerar_ocorrencias(p_id); end if;
end $$;

-- "só esta": muda data/prazo/técnicos de UMA ocorrência (não mexe na série)
create or replace function public.alterar_ocorrencia(p_id uuid, p_data date, p_prazo date, p_tecnicos uuid[])
returns void language plpgsql security definer as $$
declare v_tenant uuid := public.get_meu_tenant(); i public.checklist_instances; t uuid;
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  select * into i from public.checklist_instances where id = p_id and tenant_id = v_tenant and context_type = 'avulso';
  if not found then raise exception 'Checklist não encontrado.'; end if;
  if i.status = 'concluido' then raise exception 'Checklist concluído não pode ser remarcado.'; end if;
  if p_data is not null and p_prazo is not null and p_prazo < p_data then raise exception 'O prazo precisa ser na data ou depois.'; end if;
  if exists (select 1 from unnest(coalesce(p_tecnicos, '{}')) x
             where not exists (select 1 from public.users u where u.id = x and u.tenant_id = v_tenant)) then
    raise exception 'Técnico não encontrado.'; end if;
  if i.serie_id is not null and p_data is distinct from i.data_prevista
     and exists (select 1 from public.checklist_instances where serie_id = i.serie_id and data_prevista = p_data and id <> p_id) then
    raise exception 'Já existe uma ocorrência desta série nessa data.'; end if;
  update public.checklist_instances set data_prevista = p_data, prazo = coalesce(p_prazo, p_data) where id = p_id;
  delete from public.checklist_instance_targets where instance_id = p_id;
  foreach t in array coalesce(p_tecnicos, '{}') loop
    insert into public.checklist_instance_targets (tenant_id, instance_id, technician_id) values (v_tenant, p_id, t);
  end loop;
end $$;

-- ---------- agendamento: de hora em hora ----------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'atos-gerar-ocorrencias';
  perform cron.schedule('atos-gerar-ocorrencias', '7 * * * *', 'select public.gerar_ocorrencias()');
exception when others then
  raise notice 'pg_cron indisponível neste ambiente: %', sqlerrm;
end $$;
