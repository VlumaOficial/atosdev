-- ============================================================
-- ATOS — Migration 071: portal E5c — Resolvido → Fechado, reabrir, novo chamado ligado e assinatura como confirmação
-- ============================================================
-- * "Concluída" na OS = "Resolvido" no portal, com o resumo do que foi feito, o relatório (PDF) e os botões
--   "Confirmar solução" / "Não foi resolvido". Confirmar (ou, sem resposta, N dias úteis depois) FECHA o chamado.
-- * "Não foi resolvido" reabre a OS (volta ao último grupo/técnico) com motivo; o tempo entre resolvido e reaberto
--   não conta no SLA. Depois de fechado não reabre: o cliente abre um novo chamado "relacionado a".
-- * Assinatura do próprio solicitante em campo conta como confirmação: o chamado já nasce Fechado.
-- ATENÇÃO (PRD): rotina de fechamento automático via pg_cron.
-- ============================================================
-- correção da 070: as funções que criam os motivos padrão de cancelamento não podem ser chamadas pelos usuários
revoke execute on function public.fn_motivos_cancelamento_padrao(uuid) from public, anon, authenticated;
revoke execute on function public.fn_tenant_motivos_cancelamento() from public, anon, authenticated;
alter table public.orders add column if not exists fechada_em timestamptz;
alter table public.orders add column if not exists fechamento_tipo text;
alter table public.orders drop constraint if exists orders_fechamento_tipo_check;
alter table public.orders add constraint orders_fechamento_tipo_check check (fechamento_tipo is null or fechamento_tipo in ('confirmada', 'assinatura', 'automatica'));
alter table public.orders add column if not exists assinou_solicitante boolean not null default false;
alter table public.orders add column if not exists reaberturas int not null default 0;
alter table public.orders add column if not exists nao_resolvido_motivo text;
alter table public.tenants add column if not exists fechamento_dias_uteis int not null default 3 check (fechamento_dias_uteis between 0 and 30);
-- as OS já concluídas antes desta migration não ficam "aguardando confirmação": consideram-se fechadas
update public.orders set fechada_em = coalesce(completed_at, now()), fechamento_tipo = 'automatica' where status = 'concluida' and fechada_em is null;

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('sla_em_risco', 'sla_vencido', 'transferida', 'pingue_pongue', 'solicitacao_acesso', 'novo_chamado_portal', 'mensagem_cliente', 'previsao_vencida', 'reagendamento_pedido', 'cancelamento_cliente', 'reabertura_cliente'));

create or replace function public.definir_fechamento_dias(p_dias int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.get_meu_role() <> 'admin' then raise exception 'Só o administrador da empresa define o fechamento automático.'; end if;
  if p_dias is null or p_dias < 0 or p_dias > 30 then raise exception 'Informe de 0 a 30 dias úteis (0 = não fechar sozinho).'; end if;
  update public.tenants set fechamento_dias_uteis = p_dias where id = public.get_meu_tenant();
end $$;
revoke execute on function public.definir_fechamento_dias(int) from public, anon;
grant execute on function public.definir_fechamento_dias(int) to authenticated;

-- N dias úteis depois (calendário da empresa/unidade; mantém a hora do dia)
create or replace function public.adicionar_dias_uteis(p_horario uuid, p_ts timestamptz, p_dias int, p_ibge text, p_fuso text default 'America/Sao_Paulo')
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare d date := (p_ts at time zone p_fuso)::date; t time := (p_ts at time zone p_fuso)::time; n int := 0; guarda int := 0;
begin
  while n < p_dias and guarda < 400 loop
    d := d + 1; guarda := guarda + 1;
    if p_horario is null or public.eh_dia_util(p_horario, d, p_ibge) then n := n + 1; end if;
  end loop;
  return (d + t) at time zone p_fuso;
end $$;
revoke execute on function public.adicionar_dias_uteis(uuid, timestamptz, int, text, text) from public, anon, authenticated;

-- "Fechado" é visto só pelo cliente (a OS continua "Concluída" por dentro, com "fechada em")
create or replace function public.portal_status_chamado(p_status text, p_fechada timestamptz)
returns text language sql immutable as $$ select case when p_status = 'concluida' and p_fechada is not null then 'fechado' else public.portal_status_cliente(p_status) end $$;

create or replace function public.fn_orders_fechamento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'UPDATE' then return new; end if;
  if new.status = 'concluida' and old.status <> 'concluida' then
    new.fechada_em := null; new.fechamento_tipo := null;
    -- a assinatura do próprio solicitante, em campo, vale como a confirmação da solução
    if new.solicitante_id is not null and new.assinou_solicitante and new.signature_path is not null then
      new.fechada_em := now(); new.fechamento_tipo := 'assinatura';
    end if;
  elsif old.status = 'concluida' and new.status <> 'concluida' then
    new.fechada_em := null; new.fechamento_tipo := null; new.assinou_solicitante := false; new.reaberturas := old.reaberturas + 1;
  end if;
  return new;
end $$;
revoke execute on function public.fn_orders_fechamento() from public, anon, authenticated;
drop trigger if exists trg_orders_fechamento on public.orders;
create trigger trg_orders_fechamento before update on public.orders
  for each row execute function public.fn_orders_fechamento();

-- cliente: confirmar a solução (fecha o chamado)
create or replace function public.portal_confirmar_solucao(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_pessoa public.portal_pessoas;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or not public.portal_ve_chamado(o) then raise exception 'Chamado não encontrado.'; end if;
  if not public.portal_termos_aceitos(o.tenant_id) then raise exception 'Aceite os termos de uso e o aviso de privacidade.'; end if;
  if o.status <> 'concluida' or o.fechada_em is not null then raise exception 'Este chamado não está aguardando a sua confirmação.'; end if;
  select * into v_pessoa from public.portal_pessoas where user_id = auth.uid();
  update public.orders set fechada_em = now(), fechamento_tipo = 'confirmada' where id = o.id;
  insert into public.order_events (tenant_id, order_id, event_type, actor_name, details)
  values (o.tenant_id, o.id, 'closed', 'Portal — ' || coalesce(v_pessoa.nome, 'cliente'), jsonb_build_object('tipo', 'confirmada'));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.portal_confirmar_solucao(uuid) from public, anon;
grant execute on function public.portal_confirmar_solucao(uuid) to authenticated;

-- cliente: "não foi resolvido" reabre a OS (último grupo/técnico) com motivo
create or replace function public.portal_nao_resolvido(p_order uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_pessoa public.portal_pessoas; v_motivo text := trim(coalesce(p_motivo, ''));
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or not public.portal_ve_chamado(o) then raise exception 'Chamado não encontrado.'; end if;
  if not public.portal_termos_aceitos(o.tenant_id) then raise exception 'Aceite os termos de uso e o aviso de privacidade.'; end if;
  if o.status <> 'concluida' or o.fechada_em is not null then raise exception 'Este chamado já foi fechado: abra um novo chamado ligado a ele.'; end if;
  if length(v_motivo) < 3 or length(v_motivo) > 500 then raise exception 'Conte o que continua errado (de 3 a 500 letras).'; end if;
  select * into v_pessoa from public.portal_pessoas where user_id = auth.uid();
  update public.orders set status = 'em_andamento', nao_resolvido_motivo = v_motivo where id = o.id;
  insert into public.order_events (tenant_id, order_id, event_type, actor_name, details)
  values (o.tenant_id, o.id, 'reopened', 'Portal — ' || coalesce(v_pessoa.nome, 'cliente'), jsonb_build_object('por', 'cliente', 'motivo', v_motivo));
  perform public.fn_avisar_responsaveis(o.id, 'reabertura_cliente', o.number || ' — o cliente diz que NÃO foi resolvido', coalesce(v_pessoa.nome, 'Cliente') || ': ' || left(v_motivo, 120));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.portal_nao_resolvido(uuid, text) from public, anon;
grant execute on function public.portal_nao_resolvido(uuid, text) to authenticated;

-- fechamento automático: sem resposta depois de N dias úteis, o chamado resolvido é fechado
create or replace function public.fechar_chamados_resolvidos()
returns int language plpgsql security definer set search_path = public as $$
declare o record; v_n int := 0;
begin
  for o in select ord.id, ord.tenant_id, ord.completed_at, t.fechamento_dias_uteis d, coalesce(t.fuso_horario, 'America/Sao_Paulo') fuso,
                  (select cidade_ibge from public.locations l where l.id = ord.location_id) ibge
             from public.orders ord join public.tenants t on t.id = ord.tenant_id
            where ord.status = 'concluida' and ord.fechada_em is null and ord.solicitante_id is not null and ord.completed_at is not null and t.fechamento_dias_uteis > 0
  loop
    if public.adicionar_dias_uteis(public.horario_padrao(o.tenant_id), o.completed_at, o.d, o.ibge, o.fuso) <= now() then
      update public.orders set fechada_em = now(), fechamento_tipo = 'automatica' where id = o.id;
      insert into public.order_events (tenant_id, order_id, event_type, actor_name, details) values (o.tenant_id, o.id, 'closed', 'Sistema', jsonb_build_object('tipo', 'automatica'));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.fechar_chamados_resolvidos() from public, anon, authenticated;
do $$ begin perform cron.schedule('atos-fechar-resolvidos', '*/30 * * * *', 'select public.fechar_chamados_resolvidos()'); end $$;

-- caminho do relatório (PDF) mais recente para quem enxerga o chamado resolvido; a URL assinada sai pela função portal-relatorio
create or replace function public.portal_relatorio_chamado(p_order uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or not public.portal_ve_chamado(o) or o.status <> 'concluida' then return null; end if;
  return (select r.file_path from public.order_reports r where r.order_id = o.id and r.status = 'gerado' and r.removido_em is null order by r.versao desc limit 1);
end $$;
revoke execute on function public.portal_relatorio_chamado(uuid) from public, anon;
grant execute on function public.portal_relatorio_chamado(uuid) to authenticated;

-- ---------- SLA: o tempo entre resolvido e reaberto não conta ----------
create or replace function public.fn_orders_sla()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_t public.tenants; v_pol public.sla_politicas; v_h uuid; v_ibge text; v_min int;
  v_recalc boolean := false; v_agora timestamptz := now(); v_para boolean; v_lim int; v_cred int;
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
    -- reabrir uma OS resolvida (pelo cliente ou pela equipe): o tempo entre "resolvido" e "reaberto" NÃO conta no SLA (E5c)
    if old.status = 'concluida' and new.status <> 'concluida' and old.completed_at is not null and new.sla_horario_id is not null then
      new.sla_pausa_min := new.sla_pausa_min + coalesce((extract(epoch from public.horas_uteis_entre(new.sla_horario_id, old.completed_at, v_agora,
        (select cidade_ibge from public.locations where id = new.location_id))) / 60)::int, 0);
      v_recalc := true;
    end if;
    -- agendamento a pedido do cliente (E5b): o tempo até a nova data PAUSA o SLA e o tempo já gasto é mantido
    -- (antes, a data virava a base e o prazo recomeçava do zero). Crédito em horas úteis do calendário da OS;
    -- ao sair de "agendada" (ou trocar a data) o crédito aberto é acertado pelo tempo realmente decorrido.
    if old.sla_agend_aberto_min > 0 and (new.status <> 'agendada' or new.scheduled_at is distinct from old.scheduled_at or not new.agendado_pelo_cliente) then
      new.sla_agend_min := new.sla_agend_min - old.sla_agend_aberto_min + coalesce((extract(epoch from public.horas_uteis_entre(new.sla_horario_id, old.sla_agend_desde, least(v_agora, old.sla_agend_ate),
        (select cidade_ibge from public.locations where id = new.location_id))) / 60)::int, 0);
      new.sla_agend_aberto_min := 0; new.sla_agend_desde := null; new.sla_agend_ate := null;
      v_recalc := true;
    end if;
    if new.status = 'agendada' and new.agendado_pelo_cliente and new.scheduled_at is not null and new.scheduled_at > v_agora
       and (old.status <> 'agendada' or new.scheduled_at is distinct from old.scheduled_at or not old.agendado_pelo_cliente)
       and new.sla_horario_id is not null and new.tipo in ('incidente', 'requisicao') then
      select sla_limite_reagendamentos into v_lim from public.tenants where id = new.tenant_id;
      if coalesce(v_lim, 0) > 0 and new.reagendamentos >= v_lim then
        raise exception 'Este chamado já atingiu o limite de % agendamentos a pedido do cliente.', v_lim;
      end if;
      v_cred := coalesce((extract(epoch from public.horas_uteis_entre(new.sla_horario_id, v_agora, new.scheduled_at, (select cidade_ibge from public.locations where id = new.location_id))) / 60)::int, 0);
      new.sla_agend_min := new.sla_agend_min + v_cred;
      new.sla_agend_aberto_min := v_cred; new.sla_agend_desde := v_agora; new.sla_agend_ate := new.scheduled_at;
      new.reagendamentos := new.reagendamentos + 1;
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
        new.prazo_atendimento := public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => v_pol.atendimento_min + new.sla_agend_min), v_ibge);
        new.risco_atendimento := public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => ((v_pol.atendimento_min * v_t.sla_risco_pct / 100) + new.sla_agend_min)), v_ibge);
        new.prazo_solucao := public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => v_pol.solucao_min + new.sla_pausa_min + new.sla_agend_min), v_ibge);
        new.risco_solucao := public.somar_horas_uteis(v_h, new.sla_base, make_interval(mins => ((v_pol.solucao_min * v_t.sla_risco_pct / 100) + new.sla_pausa_min + new.sla_agend_min)), v_ibge);
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

-- ---------- funções do portal reescritas ----------
create or replace function public.portal_listar_chamados(p_tenant uuid, p_situacao text default 'abertos', p_busca text default null, p_pagina int default 1, p_tamanho int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_fuso text; v_busca text := nullif(trim(coalesce(p_busca, '')), ''); v_res jsonb;
        v_tam int := greatest(1, least(coalesce(p_tamanho, 20), 50)); v_pag int := greatest(1, coalesce(p_pagina, 1));
begin
  if not public.portal_tem_vinculo(p_tenant) then raise exception 'Sem acesso a este portal.'; end if;
  select coalesce(fuso_horario, 'America/Sao_Paulo') into v_fuso from public.tenants where id = p_tenant;
  if v_busca is not null then v_busca := replace(replace(replace(v_busca, '\', '\\'), '%', '\%'), '_', '\_'); end if;
  with vis as (
    select o.* from public.orders o where o.tenant_id = p_tenant and public.portal_ve_chamado(o)
       and (v_busca is null or o.number ilike '%' || v_busca || '%' or o.title ilike '%' || v_busca || '%')
  ),
  filt as (
    select * from vis v where case p_situacao when 'abertos' then v.status not in ('concluida', 'cancelada')
                                              when 'resolvidos' then v.status in ('concluida', 'cancelada') else true end
  ),
  pag as (select * from filt order by created_at desc limit v_tam offset (v_pag - 1) * v_tam)
  select jsonb_build_object(
    'total', (select count(*) from filt),
    'contagens', jsonb_build_object(
      'abertos', (select count(*) from vis where status not in ('concluida', 'cancelada')),
      'resolvidos_mes', (select count(*) from vis where status = 'concluida' and (completed_at at time zone v_fuso) >= date_trunc('month', now() at time zone v_fuso)),
      'aguardando_voce', (select count(*) from vis where status = 'pausada' and aguardando_cliente_desde is not null),
      'todos', (select count(*) from vis)),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'numero', g.number, 'titulo', g.title, 'tipo', g.tipo, 'status', public.portal_status_chamado(g.status, g.fechada_em),
        'criado_em', g.created_at, 'atualizado_em', g.updated_at,
        'cliente', (select name from public.clients where id = g.client_id),
        'unidade', (select name from public.locations where id = g.location_id),
        'categoria', (select nome from public.os_categorias where id = g.categoria_id),
        'aguardando_voce', g.status = 'pausada' and g.aguardando_cliente_desde is not null,
        'meu', g.solicitante_id = auth.uid(),
        'solicitante', case when g.solicitante_id = auth.uid() then 'Você' else (select nome from public.portal_pessoas where user_id = g.solicitante_id) end,
        'afetados', 1 + (select count(*) from public.os_tambem_afeta a where a.order_id = g.id)) order by g.created_at desc) from pag g), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.portal_listar_chamados(uuid, text, text, int, int) from public, anon;
grant execute on function public.portal_listar_chamados(uuid, text, text, int, int) to authenticated;

create or replace function public.portal_obter_chamado(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; v_fuso text;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or not public.portal_ve_chamado(o) then raise exception 'Chamado não encontrado.'; end if;
  select coalesce(fuso_horario, 'America/Sao_Paulo') into v_fuso from public.tenants where id = o.tenant_id;
  return jsonb_build_object(
    'id', o.id, 'client_id', o.client_id, 'numero', o.number, 'titulo', o.title, 'descricao', o.description, 'tipo', o.tipo,
    'status', public.portal_status_chamado(o.status, o.fechada_em), 'criado_em', o.created_at, 'atualizado_em', o.updated_at,
    'cliente', (select name from public.clients where id = o.client_id),
    'unidade', (select name from public.locations where id = o.location_id),
    'categoria', (select jsonb_build_object('nome', c.nome, 'pai', (select nome from public.os_categorias where id = c.pai_id)) from public.os_categorias c where c.id = o.categoria_id),
    'solicitante', case when o.solicitante_id = auth.uid() then 'Você' else (select nome from public.portal_pessoas where user_id = o.solicitante_id) end,
    'meu', o.solicitante_id = auth.uid(),
    'equipe', (select nome from public.portal_equipes where id = o.equipe_id),
    'compartilhado', o.compartilhado_equipe,
    'agendado_para', case when o.status = 'agendada' then o.scheduled_at end,
    'tecnico', case when o.status in ('agendada', 'em_andamento', 'pausada') then (select name from public.users where id = o.technician_id) end,
    'preferencias', o.preferencia_agendamento,
    'afetados', 1 + (select count(*) from public.os_tambem_afeta a where a.order_id = o.id),
    'eu_afetado', exists (select 1 from public.os_tambem_afeta a where a.order_id = o.id and a.user_id = auth.uid()),
    'anexos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'nome', a.nome, 'tipo', a.tipo, 'mime', a.mime, 'bytes', a.bytes) order by a.criado_em)
                          from public.os_anexos_cliente a where a.order_id = o.id and a.comentario_id is null), '[]'::jsonb),
    -- só a conversa pública (resposta ao cliente e mensagens do cliente); notas internas nunca saem
    'mensagens', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', c.id, 'em', c.created_at,
                    'autor', case when c.autor_portal_id is null then 'empresa' else 'cliente' end,
                    'nome', case when c.autor_portal_id is null then split_part(coalesce(c.author_name, 'Atendimento'), ' ', 1)
                                 when c.autor_portal_id = auth.uid() then 'Você'
                                 else coalesce((select nome from public.portal_pessoas where user_id = c.autor_portal_id), 'Cliente') end,
                    'texto', c.comment,
                    'anexos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'nome', a.nome, 'tipo', a.tipo, 'mime', a.mime, 'bytes', a.bytes) order by a.criado_em)
                                         from public.os_anexos_cliente a where a.comentario_id = c.id), '[]'::jsonb)) order by c.created_at)
                    from public.order_comments c where c.order_id = o.id and c.visibilidade = 'cliente'), '[]'::jsonb),
    'pode_responder', o.status <> 'cancelada',
    -- prazos que o cliente pode ver, conforme a transparência da empresa (com exceção por cliente)
    'prazos', case when public.portal_transparencia(o) = 'oculto' or o.tipo = 'visita' or o.prazo_solucao is null then null else jsonb_build_object(
        'nivel', public.portal_transparencia(o),
        'atendimento', case when o.atendido_em is null then o.prazo_atendimento end,
        'solucao', o.prazo_solucao,
        'pausado', o.sla_pausado_desde is not null or o.sla_agend_aberto_min > 0,
        'situacao', case when public.portal_transparencia(o) = 'completo' then
                       case public.sla_situacao(o) when 'violado' then 'fora_do_prazo' when 'vencido' then 'fora_do_prazo' when 'cumprido' then 'no_prazo'
                                                   when 'pausado' then 'pausado' else 'no_prazo' end end) end,
    'agendamento', public.portal_agendamento_do_chamado(o),
    -- resolvido: resumo do que foi feito, relatório e as respostas do cliente (confirmar / não foi resolvido); fechado: como fechou
    'resolucao', case when o.status = 'concluida' then jsonb_build_object(
        'resumo', o.completion_notes, 'concluida_em', o.completed_at, 'fechada_em', o.fechada_em, 'fechamento_tipo', o.fechamento_tipo,
        'pode_confirmar', o.fechada_em is null, 'pode_nao_resolvido', o.fechada_em is null,
        'fecha_em', case when o.fechada_em is null and (select fechamento_dias_uteis from public.tenants where id = o.tenant_id) > 0 then
                      public.adicionar_dias_uteis(public.horario_padrao(o.tenant_id), o.completed_at, (select fechamento_dias_uteis from public.tenants where id = o.tenant_id),
                        (select cidade_ibge from public.locations where id = o.location_id), (select coalesce(fuso_horario, 'America/Sao_Paulo') from public.tenants where id = o.tenant_id)) end,
        'relatorio', exists (select 1 from public.order_reports r where r.order_id = o.id and r.status = 'gerado' and r.removido_em is null),
        'pode_novo_chamado', o.fechada_em is not null) end,
    'reaberturas', o.reaberturas, 'motivo_nao_resolvido', o.nao_resolvido_motivo,
    'config_agendamento', public.agendamento_para_portal(o.tenant_id),
    'relacionada', (select jsonb_build_object('id', r.id, 'numero', r.number) from public.orders r where r.id = o.relacionada_a and public.portal_ve_chamado(r)),
    'derivados', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'numero', r.number, 'tipo', r.tipo) order by r.created_at) from public.orders r where r.relacionada_a = o.id and public.portal_ve_chamado(r)), '[]'::jsonb),
    -- visita não realizada (cliente ausente, sem acesso…): o cliente vê o motivo e pode pedir uma nova visita
    'cancelamento', case when o.status = 'cancelada' and o.improdutiva then jsonb_build_object(
        'texto', 'Visita não realizada: ' || lower(coalesce((select nome from public.motivos_cancelamento where id = o.cancel_motivo_id), 'motivo não informado')),
        'ausente', coalesce((select codigo = 'ausente' from public.motivos_cancelamento where id = o.cancel_motivo_id), false),
        'pode_pedir_nova_visita', o.tipo = 'visita' and not exists (select 1 from public.orders r where r.relacionada_a = o.id and r.status not in ('cancelada', 'concluida'))) end,
    'aguardando_voce', (o.status = 'pausada' and o.aguardando_cliente_desde is not null),
    -- pausa vista pelo cliente: "aciona" (Aguardando sua resposta), "comunica" (texto + previsão); "interno" não aparece
    'pausa', case when o.status = 'pausada' then (select case m.comportamento
                 when 'aciona' then jsonb_build_object('tipo', 'aciona', 'texto', coalesce(nullif(trim(m.texto_cliente), ''), 'Aguardando a sua resposta'), 'desde', o.aguardando_cliente_desde)
                 when 'comunica' then jsonb_build_object('tipo', 'comunica', 'texto', coalesce(nullif(trim(m.texto_cliente), ''), m.nome), 'previsao', o.previsao_retorno) end
               from public.motivos_pausa m where m.id = o.pause_motivo_id) end,
    -- só marcos que o cliente deve ver (sem notas internas, transferências ou nomes de pessoas)
    'linha_do_tempo', coalesce((select jsonb_agg(jsonb_build_object('evento', e.event_type, 'em', e.created_at, 'para', e.details->>'scheduled_at',
                                       'detalhe', case when e.event_type = 'reclassified' then jsonb_build_object('de', e.details->>'de', 'para', e.details->>'para', 'motivo', e.details->>'motivo', 'assunto', e.details->>'assunto')
                                                       when e.event_type = 'paused' then (select jsonb_build_object('texto', coalesce(nullif(trim(m.texto_cliente), ''), m.nome), 'tipo', m.comportamento, 'para_sla', m.para_sla, 'previsao', e.details->>'previsao_retorno')
                                                                                           from public.motivos_pausa m where m.id::text = e.details->>'motivo_id')
                                                       when e.event_type = 'scheduled' and (e.details->>'a_pedido_do_cliente')::boolean then jsonb_build_object('a_pedido_do_cliente', true, 'reagendado', coalesce((e.details->>'reagendado')::boolean, false)) end)
                                       order by e.created_at)
                                  from public.order_events e where e.order_id = o.id and (
                                       e.event_type in ('created', 'scheduled', 'started', 'completed', 'cancelled', 'reopened', 'reclassified')
                                    -- pausa só aparece para o cliente quando o motivo não é interno; a retomada, quando a pausa anterior apareceu
                                    or (e.event_type = 'paused' and exists (select 1 from public.motivos_pausa m where m.id::text = e.details->>'motivo_id' and m.comportamento <> 'interno'))
                                    or (e.event_type = 'resumed' and exists (select 1 from public.order_events p where p.order_id = e.order_id and p.event_type = 'paused'
                                          and p.created_at = (select max(q.created_at) from public.order_events q where q.order_id = e.order_id and q.event_type = 'paused' and q.created_at < e.created_at)
                                          and exists (select 1 from public.motivos_pausa m where m.id::text = p.details->>'motivo_id' and m.comportamento <> 'interno')))
                                  )), '[]'::jsonb),
    'contatos', (select portal_contatos from public.tenants where id = o.tenant_id));
end $$;
revoke execute on function public.portal_obter_chamado(uuid) from public, anon;
grant execute on function public.portal_obter_chamado(uuid) to authenticated;

create or replace function public.portal_info_chamado(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; v_interno boolean := public.get_meu_role() in ('admin', 'gestor', 'atendente');
begin
  if not public.pode_ver_os(p_order) then raise exception 'OS não encontrada.'; end if;
  select * into o from public.orders where id = p_order;
  if o.origem = 'interno' and o.solicitante_id is null then return null; end if;
  return jsonb_build_object(
    'origem', o.origem,
    'tipo', o.tipo,
    'solicitante', (select jsonb_build_object('nome', p.nome, 'email', case when v_interno then p.email end, 'celular', case when v_interno then p.celular end)
                      from public.portal_pessoas p where p.user_id = o.solicitante_id),
    'equipe', (select nome from public.portal_equipes where id = o.equipe_id),
    'compartilhado', o.compartilhado_equipe,
    'prioridade_informada', o.prioridade_informada,
    'prioridade_atual', o.priority,
    'prioridade_modo', (select prioridade_modo from public.tenants where id = o.tenant_id),
    'matriz', (select prioridade_matriz from public.tenants where id = o.tenant_id),
    'impacto', o.impacto, 'urgencia', o.urgencia,
    'categoria_id', o.categoria_id,
    'classificada_em', o.classificada_em,
    'classificada_por', (select name from public.users where id = o.classificada_por),
    'reclassificacoes', coalesce((select jsonb_agg(jsonb_build_object('em', e.created_at, 'por', e.actor_name, 'de', e.details->>'de', 'para', e.details->>'para',
                                                                      'motivo', e.details->>'motivo', 'assunto', e.details->>'assunto') order by e.created_at)
                                   from public.order_events e where e.order_id = o.id and e.event_type = 'reclassified'), '[]'::jsonb),
    'fechada_em', o.fechada_em, 'fechamento_tipo', o.fechamento_tipo, 'reaberturas', o.reaberturas, 'motivo_nao_resolvido', o.nao_resolvido_motivo,
    'solicitante_nome', (select nome from public.portal_pessoas where user_id = o.solicitante_id), 'assinou_solicitante', o.assinou_solicitante,
    'fecha_em', case when o.status = 'concluida' and o.fechada_em is null and (select fechamento_dias_uteis from public.tenants where id = o.tenant_id) > 0 then
                  public.adicionar_dias_uteis(public.horario_padrao(o.tenant_id), o.completed_at, (select fechamento_dias_uteis from public.tenants where id = o.tenant_id),
                    (select cidade_ibge from public.locations where id = o.location_id), (select coalesce(fuso_horario, 'America/Sao_Paulo') from public.tenants where id = o.tenant_id)) end,
    'relacionada', (select jsonb_build_object('id', r.id, 'numero', r.number, 'tipo', r.tipo) from public.orders r where r.id = o.relacionada_a),
    'derivados', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'numero', r.number, 'tipo', r.tipo) order by r.created_at) from public.orders r where r.relacionada_a = o.id), '[]'::jsonb),
    'improdutiva', o.improdutiva, 'cliente_ausente_em', o.cliente_ausente_em,
    'agendamento_status', o.agendamento_status, 'agendamento_cliente_em', o.agendamento_cliente_em,
    'reagendamento_motivo', o.reagendamento_motivo, 'reagendamentos_cliente', o.reagendamentos_cliente,
    'janelas', public.agendamento_efetivo(o.tenant_id)->'janelas',
    'aguardando_cliente_desde', o.aguardando_cliente_desde,
    'previsao_retorno', case when o.status = 'pausada' then o.previsao_retorno end,
    'reagendamentos', o.reagendamentos,
    'afetados', 1 + (select count(*) from public.os_tambem_afeta a where a.order_id = o.id),
    'preferencias', o.preferencia_agendamento,
    'anexos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'nome', a.nome, 'tipo', a.tipo, 'mime', a.mime, 'bytes', a.bytes) order by a.criado_em)
                          from public.os_anexos_cliente a where a.order_id = o.id and a.comentario_id is null), '[]'::jsonb),
    'portal_host', (select e.host from public.portal_enderecos e where e.tenant_id = o.tenant_id and e.situacao = 'ativo' and e.principal order by e.criado_em desc limit 1));
end $$;
revoke execute on function public.portal_info_chamado(uuid) from public, anon;
grant execute on function public.portal_info_chamado(uuid) to authenticated;

create or replace function public.portal_abrir_chamado(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := (p->>'client_id')::uuid; v_perfil text; v_t uuid; v_tenant public.tenants; v_cfg jsonb;
  v_tipo text := p->>'tipo'; v_cat public.os_categorias; v_pai public.os_categorias; v_loc uuid := nullif(p->>'location_id', '')::uuid;
  v_titulo text := trim(coalesce(p->>'titulo', '')); v_desc text := trim(coalesce(p->>'descricao', ''));
  v_equipe uuid := nullif(p->>'equipe_id', '')::uuid; v_nequipes int; v_prio text := 'baixo'; v_informada text; v_imp text; v_urg text;
  v_pref jsonb := coalesce(p->'preferencias', '[]'::jsonb); v_item jsonb; v_anx jsonb; v_pessoa public.portal_pessoas;
  v_id uuid; v_num text; v_n int; v_prefix text; v_ncat int; v_rel uuid := nullif(p->>'relacionada_a', '')::uuid;
begin
  v_perfil := public.portal_perfil_no_cliente(v_client);
  if v_perfil is null then raise exception 'Sem acesso a este cliente.'; end if;
  select tenant_id into v_t from public.clients where id = v_client;
  select * into v_tenant from public.tenants where id = v_t;
  if not public.portal_termos_aceitos(v_t) then raise exception 'Aceite os termos de uso e o aviso de privacidade para abrir chamados.'; end if;
  select * into v_pessoa from public.portal_pessoas where user_id = auth.uid();
  v_cfg := public.portal_abertura_efetiva(v_t);

  if coalesce(v_tipo, '') not in ('incidente', 'requisicao', 'visita', 'preventiva') or not coalesce((v_cfg#>>array['tipos', v_tipo, 'ativo'])::boolean, false) then
    raise exception 'Este tipo de chamado não está disponível.';
  end if;
  select count(*) into v_n from public.orders where solicitante_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_n >= 10 then raise exception 'Muitos chamados abertos em pouco tempo. Aguarde um pouco ou fale com a empresa.'; end if;

  -- assunto: obrigatório só quando o catálogo tem categorias visíveis para este tipo; sem nenhuma, o chamado entra sem assunto (fila de entrada)
  select count(*) into v_ncat from public.os_categorias c left join public.os_categorias pai on pai.id = c.pai_id
   where c.tenant_id = v_t and c.ativo and c.visivel_portal and v_tipo = any (c.tipos_portal) and (c.pai_id is null or coalesce(pai.ativo and pai.visivel_portal, false));
  if nullif(p->>'categoria_id', '') is not null then
    select * into v_cat from public.os_categorias where id = (p->>'categoria_id')::uuid and tenant_id = v_t and ativo and visivel_portal and v_tipo = any (tipos_portal);
    if v_cat.id is null then raise exception 'Escolha um assunto da lista.'; end if;
    if v_cat.pai_id is not null then
      select * into v_pai from public.os_categorias where id = v_cat.pai_id;
      if not coalesce(v_pai.ativo and v_pai.visivel_portal, false) then raise exception 'Escolha um assunto da lista.'; end if;   -- pai oculto/indefinido esconde a filha
    end if;
  elsif v_ncat > 0 then
    raise exception 'Escolha um assunto da lista.';
  end if;
  if length(v_titulo) < 3 or length(v_titulo) > 120 then raise exception 'Informe um título de 3 a 120 caracteres.'; end if;
  if length(v_desc) < 10 or length(v_desc) > 4000 then raise exception 'Descreva o que está acontecendo (de 10 a 4000 caracteres).'; end if;
  if v_loc is not null and not exists (select 1 from public.locations l where l.id = v_loc and l.client_id = v_client) then raise exception 'Unidade inválida.'; end if;

  -- equipe: a única da pessoa é automática; várias exigem a escolha
  select count(*) into v_nequipes from public.portal_equipes e join public.portal_equipe_membros m on m.equipe_id = e.id
   where e.client_id = v_client and e.ativo and m.user_id = auth.uid();
  if v_equipe is not null and not exists (select 1 from public.portal_equipes e join public.portal_equipe_membros m on m.equipe_id = e.id
                                           where e.id = v_equipe and e.client_id = v_client and e.ativo and m.user_id = auth.uid()) then
    raise exception 'Equipe inválida.';
  end if;
  if v_equipe is null and v_nequipes = 1 then
    select e.id into v_equipe from public.portal_equipes e join public.portal_equipe_membros m on m.equipe_id = e.id where e.client_id = v_client and e.ativo and m.user_id = auth.uid();
  end if;
  if v_equipe is not null and v_loc is not null and exists (select 1 from public.portal_equipe_unidades u where u.equipe_id = v_equipe)
     and not exists (select 1 from public.portal_equipe_unidades u where u.equipe_id = v_equipe and u.location_id = v_loc) then
    raise exception 'Esta unidade não faz parte da equipe escolhida.';
  end if;

  -- prioridade (só Incidente): o solicitante informa; o N1 confirma depois
  if v_tipo = 'incidente' then
    if coalesce((v_cfg#>>'{prioridade,solicitante_escolhe}')::boolean, true) then
      if v_tenant.prioridade_modo = 'matriz' then
        v_imp := p->>'impacto'; v_urg := p->>'urgencia';
        if coalesce(v_imp, '') not in ('baixo', 'medio', 'alto') or coalesce(v_urg, '') not in ('baixa', 'media', 'alta') then raise exception 'Responda às duas perguntas sobre o problema.'; end if;
        v_informada := v_tenant.prioridade_matriz -> v_imp ->> v_urg;
      else
        v_informada := p->>'nivel';
        if coalesce(v_informada, '') not in ('critico', 'alto', 'baixo') then raise exception 'Escolha a prioridade.'; end if;
        v_prio := v_informada;
      end if;
    elsif v_tenant.prioridade_modo = 'matriz' then
      v_imp := v_cat.impacto; v_urg := v_cat.urgencia;      -- sugestão do catálogo (o N1 classifica)
    end if;
  end if;

  -- preferência de data (até 3), só nos tipos com agendamento
  if jsonb_typeof(v_pref) <> 'array' then v_pref := '[]'::jsonb; end if;
  if jsonb_array_length(v_pref) > 0 and v_tipo = 'incidente' then v_pref := '[]'::jsonb; end if;
  if jsonb_array_length(v_pref) > 3 then raise exception 'Informe no máximo 3 opções de data.'; end if;
  if jsonb_array_length(v_pref) > 0 then perform public.portal_validar_opcoes_data(v_t, v_pref); end if;

  -- anexos: só da própria pasta, no máximo 5
  v_prefix := v_t::text || '/' || v_client::text || '/' || auth.uid()::text || '/';
  if jsonb_array_length(coalesce(p->'anexos', '[]'::jsonb)) > 5 then raise exception 'No máximo 5 arquivos por chamado.'; end if;
  for v_anx in select * from jsonb_array_elements(coalesce(p->'anexos', '[]'::jsonb)) loop
    if left(v_anx->>'path', length(v_prefix)) <> v_prefix or position('..' in v_anx->>'path') > 0 then raise exception 'Arquivo inválido.'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'portal-anexos' and name = v_anx->>'path') then raise exception 'Um dos arquivos não foi enviado.'; end if;
  end loop;

  if v_rel is not null and not exists (select 1 from public.orders r where r.id = v_rel and r.client_id = v_client and public.portal_ve_chamado(r) and (r.fechada_em is not null or r.status = 'cancelada')) then
    raise exception 'O chamado de origem não está disponível para ligar a este.';
  end if;
  insert into public.orders (tenant_id, client_id, location_id, title, description, tipo, categoria_id, priority, impacto, urgencia,
                             origem, solicitante_id, equipe_id, compartilhado_equipe, prioridade_informada, preferencia_agendamento, relacionada_a)
  values (v_t, v_client, v_loc, v_titulo, v_desc, v_tipo, v_cat.id, v_prio, v_imp, v_urg,
          'portal', auth.uid(), v_equipe, coalesce((p->>'compartilhado')::boolean, true), v_informada, case when jsonb_array_length(v_pref) > 0 then v_pref end, v_rel)
  returning id, number into v_id, v_num;

  for v_anx in select * from jsonb_array_elements(coalesce(p->'anexos', '[]'::jsonb)) loop
    insert into public.os_anexos_cliente (tenant_id, order_id, path, nome, tipo, mime, bytes, por)
    values (v_t, v_id, v_anx->>'path', left(coalesce(v_anx->>'nome', 'arquivo'), 200), case when v_anx->>'tipo' = 'audio' then 'audio' else 'foto' end,
            coalesce(v_anx->>'mime', 'application/octet-stream'), least(greatest((v_anx->>'bytes')::int, 1), 10485760), auth.uid());
  end loop;

  insert into public.order_events (tenant_id, order_id, event_type, actor_name, details)
  values (v_t, v_id, 'created', 'Portal — ' || coalesce(v_pessoa.nome, 'cliente'), jsonb_build_object('origem', 'portal'));
  perform public.fn_portal_auditar(v_t, 'chamado_aberto', jsonb_build_object('order_id', v_id, 'tipo', v_tipo));

  -- avisa a entrada do atendimento: coordenadores do grupo; sem grupo/coordenador, quem faz a triagem
  declare v_grupo uuid; v_avisados int := 0; v_titulo_aviso text := v_num || ' — novo chamado do portal';
          v_corpo text := v_titulo || ' · ' || (select name from public.clients where id = v_client) || ' · ' || coalesce(v_pessoa.nome, 'cliente');
  begin
    select grupo_id into v_grupo from public.orders where id = v_id;
    if v_grupo is not null then v_avisados := public.fn_avisar_coordenadores(v_grupo, 'novo_chamado_portal', v_id, v_titulo_aviso, v_corpo, null); end if;
    if v_avisados = 0 then
      insert into public.notificacoes (tenant_id, user_id, tipo, order_id, titulo, corpo)
      select v_t, u.id, 'novo_chamado_portal', v_id, v_titulo_aviso, v_corpo
        from public.users u where u.tenant_id = v_t and u.role in ('admin', 'gestor', 'atendente') and coalesce(u.active, true);
    end if;
  end;
  return jsonb_build_object('id', v_id, 'numero', v_num, 'status', 'recebido');
end $$;
revoke execute on function public.portal_abrir_chamado(jsonb) from public, anon;
grant execute on function public.portal_abrir_chamado(jsonb) to authenticated;
