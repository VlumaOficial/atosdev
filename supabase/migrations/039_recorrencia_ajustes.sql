-- ============================================================
-- ATOS — Migration 039: ajustes da recorrência (2026-09-25)
-- ============================================================
-- Três pontos que ficaram de fora da 038 sem decisão do usuário
-- (registrado no PROJETO_ATOS.md) e agora corrigidos:
--   1. DEFEITO: editar a série ("esta e as seguintes") reancorava a
--      contagem na data escolhida mesmo sem mudar a repetição — "a cada
--      2 semanas" podia mudar de ritmo ao trocar só o técnico. Agora: se
--      a regra não mudou, o início original (ritmo) é mantido; só uma
--      regra NOVA começa na data escolhida (como no Outlook)
--   2. Aviso de fim de semana/feriado também ao remarcar uma única
--      ocorrência e na data de um checklist que não se repete
--   3. Aviso de horário de funcionamento da Unidade (desenho aprovado:
--      "Recorrência: aviso"): ocorrências são por dia, então o aviso é
--      "unidade fechada neste dia da semana"
-- ============================================================

-- regra normalizada para comparar (ordem dos dias e dias_uteis=false não importam)
create or replace function public.fn_regra_norm(r jsonb)
returns jsonb language sql immutable as $$
  select (r - 'dias_semana' - 'dias_uteis')
    || case when jsonb_typeof(r->'dias_semana') = 'array'
            then jsonb_build_object('dias_semana', (select jsonb_agg(x::int order by x::int) from jsonb_array_elements_text(r->'dias_semana') x))
            else '{}'::jsonb end
    || case when coalesce((r->>'dias_uteis')::boolean, false) then '{"dias_uteis":true}'::jsonb else '{}'::jsonb end
$$;

-- Aviso de uma data para um checklist: fora do expediente da empresa
-- (fim de semana, feriado com folga) e/ou unidade fechada nesse dia.
-- null = sem aviso. Não bloqueia nada — só informa.
create or replace function public.aviso_da_data(p_data date, p_location uuid default null)
returns text language plpgsql stable as $$
declare v_tenant uuid := public.get_meu_tenant(); v_h uuid; v_ibge text; v_hf jsonb; v_avisos text[] := '{}'; v_fer text;
begin
  select id into v_h from public.horarios_atendimento where tenant_id = v_tenant and padrao;
  select cidade_ibge, horario_funcionamento into v_ibge, v_hf from public.locations where id = p_location and tenant_id = v_tenant;
  if v_h is not null and not public.eh_dia_util(v_h, p_data, v_ibge) then
    select string_agg(f.nome, ', ') into v_fer from public.feriados_do_dia(v_tenant, p_data, v_ibge) f where f.efeito = 'folga';
    v_avisos := v_avisos || coalesce(v_fer, case extract(dow from p_data)::int when 0 then 'Domingo' when 6 then 'Sábado' else 'Sem expediente' end);
  end if;
  if v_hf is not null and jsonb_array_length(coalesce(v_hf -> extract(dow from p_data)::int::text, '[]'::jsonb)) = 0 then
    v_avisos := v_avisos || 'Unidade fechada'::text;
  end if;
  return nullif(array_to_string(v_avisos, ' · '), '');
end $$;

-- prévia passa a usar o mesmo aviso (inclui unidade fechada)
create or replace function public.previa_recorrencia(
  p_regra jsonb, p_inicio date, p_location uuid default null,
  p_termino_tipo text default 'nunca', p_termino_qtd int default null, p_termino_data date default null,
  p_qtd int default 5
) returns table (data date, dia_util boolean, motivo text) language plpgsql stable as $$
declare v_tenant uuid := public.get_meu_tenant(); e text; r record;
begin
  e := public.fn_regra_erro(p_regra);
  if e is not null then raise exception '%', e; end if;
  for r in select * from public.datas_da_serie(p_regra, p_inicio, p_inicio, p_inicio + 3660, v_tenant, p_location,
                                                 p_termino_tipo, p_termino_qtd, p_termino_data, 0, greatest(1, least(p_qtd, 20))) loop
    data := r.data;
    motivo := public.aviso_da_data(r.data, p_location);
    dia_util := motivo is null;
    return next;
  end loop;
end $$;

-- 1. edição mantém o ritmo quando a regra não muda
create or replace function public.salvar_serie(
  p_id uuid, p_template uuid, p_titulo text, p_client uuid, p_location uuid, p_tecnicos uuid[],
  p_regra jsonb, p_resumo text, p_rrule text, p_inicio date,
  p_termino_tipo text, p_termino_qtd int, p_termino_data date, p_prazo_dias int,
  p_a_partir date default null
) returns uuid language plpgsql security definer as $$
declare v_tenant uuid := public.get_meu_tenant(); v_id uuid := p_id; v_hoje date; e text; s public.checklist_series;
  v_ant int; v_mesma boolean;
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
    p_a_partir := greatest(coalesce(p_a_partir, v_hoje), v_hoje);
    v_mesma := public.fn_regra_norm(p_regra) = public.fn_regra_norm(s.regra);
    perform public.fn_remover_futuras(v_id, p_a_partir);
    if not v_mesma then
      -- regra nova: começa na data escolhida; o que já foi gerado antes conta no "após N"
      select count(*) into v_ant from public.checklist_instances where serie_id = v_id and data_prevista < p_a_partir;
    end if;
    update public.checklist_series set template_id = p_template, titulo = trim(p_titulo), client_id = p_client,
      location_id = p_location, tecnicos = coalesce(p_tecnicos, '{}'), regra = p_regra, resumo = p_resumo, rrule = p_rrule,
      inicio = case when v_mesma then s.inicio else greatest(p_inicio, p_a_partir) end,
      ocorrencias_anteriores = case when v_mesma then s.ocorrencias_anteriores else v_ant end,
      termino_tipo = p_termino_tipo, termino_qtd = p_termino_qtd,
      termino_data = p_termino_data, prazo_dias = coalesce(p_prazo_dias, 1), gerar_a_partir = p_a_partir,
      gerado_ate = null, situacao = case when situacao = 'encerrada' then 'ativa' else situacao end,
      atualizado_em = now()
    where id = v_id;
  end if;
  perform public.gerar_ocorrencias(v_id);
  return v_id;
end $$;
