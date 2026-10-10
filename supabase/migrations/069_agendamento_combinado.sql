-- ============================================================
-- ATOS — Migration 069: portal E5b (parte 3) — agendamento combinado, calendário configurável e lembretes
-- ============================================================
-- * A empresa configura (Configurações › Agendamento): antecedência mínima e horizonte das datas que o cliente pode pedir,
--   as janelas (Manhã/Tarde com horários), se o cliente pode reagendar/cancelar (com antecedência, limite e motivo) e até
--   3 lembretes (N horas antes da visita).
-- * Agendamento combinado: ao agendar uma OS do portal, a data pode ser "confirmada" (era uma das pedidas, ou combinada
--   com o cliente) ou "proposta" (o cliente vê Aceitar / Pedir outra data). O cliente também pode pedir outra data de
--   um agendamento confirmado e cancelar, nos limites da empresa.
-- ATENÇÃO (PRD): rotina de lembretes via pg_cron e URL do DEV no gatilho de e-mail (como 062/066/067).
-- ============================================================
alter table public.tenants add column if not exists agendamento_config jsonb not null default '{}';

-- regras com padrão: o que a empresa não definiu usa o padrão
create or replace function public.agendamento_efetivo(p_tenant uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'antecedencia_horas', coalesce((c->>'antecedencia_horas')::int, 48),
    'horizonte_dias', coalesce((c->>'horizonte_dias')::int, 60),
    'janelas', jsonb_build_object(
      'manha', jsonb_build_object('nome', coalesce(nullif(c#>>'{janelas,manha,nome}', ''), 'Manhã'), 'inicio', coalesce(nullif(c#>>'{janelas,manha,inicio}', ''), '08:00'), 'fim', coalesce(nullif(c#>>'{janelas,manha,fim}', ''), '12:00')),
      'tarde', jsonb_build_object('nome', coalesce(nullif(c#>>'{janelas,tarde,nome}', ''), 'Tarde'), 'inicio', coalesce(nullif(c#>>'{janelas,tarde,inicio}', ''), '13:00'), 'fim', coalesce(nullif(c#>>'{janelas,tarde,fim}', ''), '18:00'))),
    'cliente_reagenda', coalesce((c->>'cliente_reagenda')::boolean, true),
    'reagendar_antecedencia_horas', coalesce((c->>'reagendar_antecedencia_horas')::int, 24),
    'max_reagendamentos_cliente', coalesce((c->>'max_reagendamentos_cliente')::int, 2),
    'reagendar_motivo_obrigatorio', coalesce((c->>'reagendar_motivo_obrigatorio')::boolean, false),
    'cliente_cancela', coalesce((c->>'cliente_cancela')::boolean, true),
    'cancelar_antecedencia_horas', coalesce((c->>'cancelar_antecedencia_horas')::int, 24),
    'lembretes', coalesce(c->'lembretes', '[{"antes_horas":48},{"antes_horas":24}]'::jsonb))
  from (select agendamento_config c from public.tenants where id = p_tenant) x
$$;
revoke execute on function public.agendamento_efetivo(uuid) from public, anon, authenticated;

create or replace function public.agendamento_data_minima(p_tenant uuid)
returns date language sql stable security definer set search_path = public as $$
  select ((now() at time zone coalesce((select fuso_horario from public.tenants where id = p_tenant), 'America/Sao_Paulo'))
          + make_interval(hours => (public.agendamento_efetivo(p_tenant)->>'antecedencia_horas')::int))::date
$$;
create or replace function public.agendamento_data_maxima(p_tenant uuid)
returns date language sql stable security definer set search_path = public as $$
  select ((now() at time zone coalesce((select fuso_horario from public.tenants where id = p_tenant), 'America/Sao_Paulo'))
          + make_interval(days => (public.agendamento_efetivo(p_tenant)->>'horizonte_dias')::int))::date
$$;
revoke execute on function public.agendamento_data_minima(uuid) from public, anon, authenticated;
revoke execute on function public.agendamento_data_maxima(uuid) from public, anon, authenticated;

-- o que a tela do portal precisa para montar o calendário
create or replace function public.agendamento_para_portal(p_tenant uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('antecedencia_horas', c->'antecedencia_horas', 'horizonte_dias', c->'horizonte_dias', 'janelas', c->'janelas',
                            'data_minima', public.agendamento_data_minima(p_tenant), 'data_maxima', public.agendamento_data_maxima(p_tenant))
  from (select public.agendamento_efetivo(p_tenant) c) x
$$;
revoke execute on function public.agendamento_para_portal(uuid) from public, anon, authenticated;

-- a empresa salva as regras (só o administrador)
create or replace function public.salvar_agendamento_config(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_j text; v_l jsonb := '[]'::jsonb; v_h int; v_ant int := coalesce((p->>'antecedencia_horas')::int, 48); v_hor int := coalesce((p->>'horizonte_dias')::int, 60); v_i text; v_f text;
begin
  if public.get_meu_role() <> 'admin' then raise exception 'Só o administrador da empresa configura o agendamento.'; end if;
  if v_ant < 0 or v_ant > 720 then raise exception 'A antecedência mínima vai de 0 a 720 horas.'; end if;
  if v_hor < 1 or v_hor > 365 then raise exception 'O horizonte vai de 1 a 365 dias.'; end if;
  if v_hor * 24 <= v_ant then raise exception 'O horizonte precisa ser maior que a antecedência mínima.'; end if;
  foreach v_j in array array['manha', 'tarde'] loop
    v_i := coalesce(nullif(p#>>array['janelas', v_j, 'inicio'], ''), case v_j when 'manha' then '08:00' else '13:00' end);   -- janela não informada: usa o padrão
    v_f := coalesce(nullif(p#>>array['janelas', v_j, 'fim'], ''), case v_j when 'manha' then '12:00' else '18:00' end);
    if v_i !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_f !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_i >= v_f then raise exception 'A janela "%" precisa ter início e fim válidos (HH:MM), com o início antes do fim.', v_j; end if;
    if length(coalesce(p#>>array['janelas', v_j, 'nome'], '')) > 30 then raise exception 'O nome da janela pode ter até 30 letras.'; end if;
  end loop;
  if coalesce((p->>'reagendar_antecedencia_horas')::int, 24) not between 0 and 720 or coalesce((p->>'cancelar_antecedencia_horas')::int, 24) not between 0 and 720 then raise exception 'A antecedência para reagendar/cancelar vai de 0 a 720 horas.'; end if;
  if coalesce((p->>'max_reagendamentos_cliente')::int, 2) not between 0 and 10 then raise exception 'O limite de reagendamentos do cliente vai de 0 a 10 (0 = sem limite).'; end if;
  if jsonb_typeof(coalesce(p->'lembretes', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'lembretes', '[]'::jsonb)) > 3 then raise exception 'No máximo 3 lembretes.'; end if;
  for v_h in select distinct (x->>'antes_horas')::int from jsonb_array_elements(coalesce(p->'lembretes', '[]'::jsonb)) x loop
    if v_h not between 1 and 720 then raise exception 'Cada lembrete é de 1 a 720 horas antes.'; end if;
    v_l := v_l || jsonb_build_array(jsonb_build_object('antes_horas', v_h));
  end loop;
  update public.tenants set agendamento_config = jsonb_build_object(
    'antecedencia_horas', v_ant, 'horizonte_dias', v_hor,
    'janelas', jsonb_build_object(
      'manha', jsonb_build_object('nome', coalesce(nullif(trim(p#>>'{janelas,manha,nome}'), ''), 'Manhã'), 'inicio', coalesce(nullif(p#>>'{janelas,manha,inicio}', ''), '08:00'), 'fim', coalesce(nullif(p#>>'{janelas,manha,fim}', ''), '12:00')),
      'tarde', jsonb_build_object('nome', coalesce(nullif(trim(p#>>'{janelas,tarde,nome}'), ''), 'Tarde'), 'inicio', coalesce(nullif(p#>>'{janelas,tarde,inicio}', ''), '13:00'), 'fim', coalesce(nullif(p#>>'{janelas,tarde,fim}', ''), '18:00'))),
    'cliente_reagenda', coalesce((p->>'cliente_reagenda')::boolean, true), 'reagendar_antecedencia_horas', coalesce((p->>'reagendar_antecedencia_horas')::int, 24),
    'max_reagendamentos_cliente', coalesce((p->>'max_reagendamentos_cliente')::int, 2), 'reagendar_motivo_obrigatorio', coalesce((p->>'reagendar_motivo_obrigatorio')::boolean, false),
    'cliente_cancela', coalesce((p->>'cliente_cancela')::boolean, true), 'cancelar_antecedencia_horas', coalesce((p->>'cancelar_antecedencia_horas')::int, 24),
    'lembretes', v_l)
   where id = public.get_meu_tenant();
end $$;
revoke execute on function public.salvar_agendamento_config(jsonb) from public, anon;
grant execute on function public.salvar_agendamento_config(jsonb) to authenticated;

-- as opções de data do cliente seguem a antecedência mínima e o horizonte da empresa
create or replace function public.portal_validar_opcoes_data(p_tenant uuid, p_opcoes jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_item jsonb; v_min date := public.agendamento_data_minima(p_tenant); v_max date := public.agendamento_data_maxima(p_tenant);
begin
  if jsonb_typeof(coalesce(p_opcoes, '[]'::jsonb)) <> 'array' then raise exception 'Opções de data inválidas.'; end if;
  if jsonb_array_length(p_opcoes) > 3 then raise exception 'Informe no máximo 3 opções de data.'; end if;
  for v_item in select * from jsonb_array_elements(p_opcoes) loop
    if v_item->>'data' is null or v_item->>'data' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Informe a data em cada opção.'; end if;
    if (v_item->>'data')::date < v_min then raise exception 'As datas pedidas precisam ser a partir de % (antecedência mínima da empresa).', to_char(v_min, 'DD/MM/YYYY'); end if;
    if (v_item->>'data')::date > v_max then raise exception 'As datas pedidas podem ir até %.', to_char(v_max, 'DD/MM/YYYY'); end if;
    if coalesce(v_item->>'periodo', 'qualquer') not in ('manha', 'tarde', 'qualquer') then raise exception 'Período inválido.'; end if;
  end loop;
end $$;
revoke execute on function public.portal_validar_opcoes_data(uuid, jsonb) from public, anon, authenticated;

-- ---------- OS: estado do agendamento combinado ----------
alter table public.orders add column if not exists agendamento_status text;
alter table public.orders drop constraint if exists orders_agendamento_status_check;
alter table public.orders add constraint orders_agendamento_status_check check (agendamento_status is null or agendamento_status in ('proposto', 'confirmado', 'reagendamento_pedido'));
alter table public.orders add column if not exists agendamento_cliente_em timestamptz;     -- quando o cliente aceitou/confirmou
alter table public.orders add column if not exists reagendamento_motivo text;
alter table public.orders add column if not exists reagendamentos_cliente int not null default 0;
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('sla_em_risco', 'sla_vencido', 'transferida', 'pingue_pongue', 'solicitacao_acesso', 'novo_chamado_portal', 'mensagem_cliente', 'previsao_vencida', 'reagendamento_pedido', 'cancelamento_cliente'));

create or replace function public.fn_orders_agendamento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fuso text;
begin
  if tg_op <> 'UPDATE' then return new; end if;
  if new.status = 'agendada' and new.solicitante_id is not null and new.scheduled_at is not null
     and (old.status <> 'agendada' or new.scheduled_at is distinct from old.scheduled_at) then
    select coalesce(fuso_horario, 'America/Sao_Paulo') into v_fuso from public.tenants where id = new.tenant_id;
    -- combinado com o cliente (a pedido dele) ou numa das datas que ele pediu = confirmado; senão, é uma PROPOSTA ao cliente
    if new.agendado_pelo_cliente or exists (select 1 from jsonb_array_elements(coalesce(new.preferencia_agendamento, '[]'::jsonb)) p
                                             where (p->>'data')::date = (new.scheduled_at at time zone v_fuso)::date) then
      new.agendamento_status := 'confirmado';
    else
      new.agendamento_status := 'proposto';
    end if;
    new.agendamento_cliente_em := null; new.reagendamento_motivo := null;
  elsif new.status <> 'agendada' and old.status = 'agendada' then
    new.agendamento_status := null; new.agendamento_cliente_em := null; new.reagendamento_motivo := null;
  end if;
  return new;
end $$;
revoke execute on function public.fn_orders_agendamento() from public, anon, authenticated;
drop trigger if exists trg_orders_agendamento on public.orders;
create trigger trg_orders_agendamento before update on public.orders
  for each row execute function public.fn_orders_agendamento();

-- o agendamento como o cliente enxerga (e o que ele pode fazer)
create or replace function public.portal_agendamento_do_chamado(o public.orders)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c jsonb := public.agendamento_efetivo(o.tenant_id); v_max int := (c->>'max_reagendamentos_cliente')::int; v_ant_r interval; v_ant_c interval;
begin
  if o.status not in ('aberta', 'agendada') then return null; end if;
  v_ant_r := make_interval(hours => (c->>'reagendar_antecedencia_horas')::int); v_ant_c := make_interval(hours => (c->>'cancelar_antecedencia_horas')::int);
  return jsonb_build_object(
    'status', o.agendamento_status, 'para', case when o.status = 'agendada' then o.scheduled_at end,
    'pedido', case when o.agendamento_status = 'reagendamento_pedido' then o.preferencia_agendamento end, 'motivo_pedido', o.reagendamento_motivo,
    'confirmado_em', o.agendamento_cliente_em,
    'pode_aceitar', o.status = 'agendada' and o.agendamento_status in ('proposto', 'confirmado') and o.agendamento_cliente_em is null,
    'pode_pedir_outra', o.status = 'agendada' and (o.agendamento_status = 'proposto'
        or (o.agendamento_status = 'confirmado' and (c->>'cliente_reagenda')::boolean and now() <= o.scheduled_at - v_ant_r and (v_max = 0 or o.reagendamentos_cliente < v_max))),
    'pode_cancelar', (c->>'cliente_cancela')::boolean and (o.status = 'aberta' or now() <= o.scheduled_at - v_ant_c),
    'motivo_obrigatorio', (c->>'reagendar_motivo_obrigatorio')::boolean,
    'reagendamentos_usados', o.reagendamentos_cliente, 'reagendamentos_limite', v_max,
    'reagendar_antecedencia_horas', (c->>'reagendar_antecedencia_horas')::int, 'cancelar_antecedencia_horas', (c->>'cancelar_antecedencia_horas')::int,
    'cliente_reagenda', (c->>'cliente_reagenda')::boolean,
    'config', public.agendamento_para_portal(o.tenant_id));
end $$;
revoke execute on function public.portal_agendamento_do_chamado(public.orders) from public, anon, authenticated;

-- avisa quem cuida da OS (técnico, coordenadores do grupo; sem ninguém, admin/gestor/atendente)
create or replace function public.fn_avisar_responsaveis(p_order uuid, p_tipo text, p_titulo text, p_corpo text)
returns int language plpgsql security definer set search_path = public as $$
declare o public.orders; v_dest uuid[]; v_n int;
begin
  select * into o from public.orders where id = p_order;
  select coalesce(array_agg(distinct u.id), '{}') into v_dest from public.users u
   where u.tenant_id = o.tenant_id and coalesce(u.active, true) and (u.id = o.technician_id
      or (o.grupo_id is not null and u.role <> 'tecnico' and exists (select 1 from public.grupo_membros m where m.grupo_id = o.grupo_id and m.user_id = u.id and m.coordenador)));
  if coalesce(array_length(v_dest, 1), 0) = 0 then
    select coalesce(array_agg(u.id), '{}') into v_dest from public.users u where u.tenant_id = o.tenant_id and u.role in ('admin', 'gestor', 'atendente') and coalesce(u.active, true);
  end if;
  insert into public.notificacoes (tenant_id, user_id, tipo, order_id, titulo, corpo) select o.tenant_id, d, p_tipo, o.id, p_titulo, p_corpo from unnest(v_dest) d;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.fn_avisar_responsaveis(uuid, text, text, text) from public, anon, authenticated;

-- cliente: aceitar a data proposta/confirmar presença, ou pedir outra data (reagendar)
create or replace function public.portal_responder_agendamento(p_order uuid, p_acao text, p_opcoes jsonb default '[]'::jsonb, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; c jsonb; v_pessoa public.portal_pessoas; v_motivo text := nullif(trim(coalesce(p_motivo, '')), ''); v_conf boolean; v_max int;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or not public.portal_ve_chamado(o) then raise exception 'Chamado não encontrado.'; end if;
  if not public.portal_termos_aceitos(o.tenant_id) then raise exception 'Aceite os termos de uso e o aviso de privacidade.'; end if;
  if o.status <> 'agendada' then raise exception 'Este chamado não tem atendimento agendado.'; end if;
  c := public.agendamento_efetivo(o.tenant_id); v_max := (c->>'max_reagendamentos_cliente')::int;
  select * into v_pessoa from public.portal_pessoas where user_id = auth.uid();
  if v_motivo is not null and length(v_motivo) > 300 then raise exception 'O motivo pode ter até 300 letras.'; end if;

  if p_acao = 'aceitar' then
    if o.agendamento_status not in ('proposto', 'confirmado') then raise exception 'Não há data para aceitar: a empresa ainda vai responder o seu pedido.'; end if;
    update public.orders set agendamento_status = 'confirmado', agendamento_cliente_em = now() where id = o.id;
    insert into public.order_events (tenant_id, order_id, event_type, actor_name, details)
    values (o.tenant_id, o.id, 'schedule_confirmed', 'Portal — ' || coalesce(v_pessoa.nome, 'cliente'), jsonb_build_object('scheduled_at', o.scheduled_at, 'por', 'cliente'));
    return jsonb_build_object('ok', true, 'acao', 'aceita');
  elsif p_acao = 'outra_data' then
    v_conf := o.agendamento_status = 'confirmado';
    if o.agendamento_status = 'reagendamento_pedido' then raise exception 'Você já pediu outra data: a empresa vai responder.'; end if;
    if v_conf then
      if not (c->>'cliente_reagenda')::boolean then raise exception 'A empresa não permite reagendar pelo portal. Fale com a empresa.'; end if;
      if now() > o.scheduled_at - make_interval(hours => (c->>'reagendar_antecedencia_horas')::int) then
        raise exception 'Já não dá para reagendar pelo portal (o prazo é de % horas antes). Fale com a empresa.', c->>'reagendar_antecedencia_horas'; end if;
      if v_max > 0 and o.reagendamentos_cliente >= v_max then raise exception 'Você já usou os % reagendamentos permitidos pelo portal. Fale com a empresa.', v_max; end if;
      if (c->>'reagendar_motivo_obrigatorio')::boolean and v_motivo is null then raise exception 'Informe o motivo do reagendamento.'; end if;
    end if;
    if jsonb_array_length(coalesce(p_opcoes, '[]'::jsonb)) < 1 then raise exception 'Informe pelo menos uma data.'; end if;
    perform public.portal_validar_opcoes_data(o.tenant_id, p_opcoes);
    update public.orders set preferencia_agendamento = p_opcoes, agendamento_status = 'reagendamento_pedido', reagendamento_motivo = v_motivo,
           reagendamentos_cliente = reagendamentos_cliente + case when v_conf then 1 else 0 end where id = o.id;
    insert into public.order_events (tenant_id, order_id, event_type, actor_name, details)
    values (o.tenant_id, o.id, 'reschedule_requested', 'Portal — ' || coalesce(v_pessoa.nome, 'cliente'), jsonb_build_object('de', o.scheduled_at, 'opcoes', p_opcoes, 'motivo', v_motivo, 'recusou_proposta', not v_conf));
    perform public.fn_avisar_responsaveis(o.id, 'reagendamento_pedido', o.number || ' — o cliente pediu outra data', coalesce(v_pessoa.nome, 'Cliente') || case when v_motivo is not null then ': ' || left(v_motivo, 100) else ' pediu outra data para o atendimento' end);
    return jsonb_build_object('ok', true, 'acao', 'pediu_outra_data');
  end if;
  raise exception 'Ação inválida.';
end $$;
revoke execute on function public.portal_responder_agendamento(uuid, text, jsonb, text) from public, anon;
grant execute on function public.portal_responder_agendamento(uuid, text, jsonb, text) to authenticated;

-- cliente: cancelar o atendimento (antes de começar), nos limites da empresa
create or replace function public.portal_cancelar_agendamento(p_order uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; c jsonb; v_pessoa public.portal_pessoas; v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or not public.portal_ve_chamado(o) then raise exception 'Chamado não encontrado.'; end if;
  if not public.portal_termos_aceitos(o.tenant_id) then raise exception 'Aceite os termos de uso e o aviso de privacidade.'; end if;
  if o.status not in ('aberta', 'agendada') then raise exception 'O atendimento já começou: fale com a empresa para cancelar.'; end if;
  c := public.agendamento_efetivo(o.tenant_id);
  if not (c->>'cliente_cancela')::boolean then raise exception 'A empresa não permite cancelar pelo portal. Fale com a empresa.'; end if;
  if o.status = 'agendada' and now() > o.scheduled_at - make_interval(hours => (c->>'cancelar_antecedencia_horas')::int) then
    raise exception 'Já não dá para cancelar pelo portal (o prazo é de % horas antes). Fale com a empresa.', c->>'cancelar_antecedencia_horas'; end if;
  if v_motivo is not null and length(v_motivo) > 300 then raise exception 'O motivo pode ter até 300 letras.'; end if;
  select * into v_pessoa from public.portal_pessoas where user_id = auth.uid();
  update public.orders set status = 'cancelada', cancel_reason = 'Cancelado pelo cliente' || coalesce(' — ' || v_motivo, '') where id = o.id;
  insert into public.order_events (tenant_id, order_id, event_type, actor_name, details)
  values (o.tenant_id, o.id, 'cancelled', 'Portal — ' || coalesce(v_pessoa.nome, 'cliente'), jsonb_build_object('por', 'cliente', 'reason', v_motivo));
  perform public.fn_avisar_responsaveis(o.id, 'cancelamento_cliente', o.number || ' — cancelado pelo cliente', coalesce(v_pessoa.nome, 'Cliente') || coalesce(': ' || left(v_motivo, 100), ''));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.portal_cancelar_agendamento(uuid, text) from public, anon;
grant execute on function public.portal_cancelar_agendamento(uuid, text) to authenticated;

-- ---------- lembretes ----------
create table if not exists public.portal_lembretes (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  scheduled_at timestamptz not null,
  antes_horas int not null,
  em timestamptz not null default now(),
  unique (order_id, scheduled_at, antes_horas)
);
alter table public.portal_lembretes enable row level security;

create or replace function public.enviar_lembretes_agendamento()
returns int language plpgsql security definer set search_path = public as $$
declare o record; l jsonb; v_h int; v_chave text; v_n int := 0; v_cfg jsonb;
begin
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'atos_service_role_key' limit 1;
  for o in select ord.id, ord.tenant_id, ord.scheduled_at from public.orders ord
            where ord.status = 'agendada' and ord.solicitante_id is not null and ord.scheduled_at > now() and ord.scheduled_at < now() + interval '31 days'
  loop
    v_cfg := public.agendamento_efetivo(o.tenant_id);
    for l in select * from jsonb_array_elements(v_cfg->'lembretes') loop
      v_h := (l->>'antes_horas')::int;
      -- o lembrete sai quando a janela abre; se o agendamento foi feito depois disso (janela já passou há mais de 1 hora), não sai
      if now() >= o.scheduled_at - make_interval(hours => v_h) and now() < o.scheduled_at - make_interval(hours => v_h) + interval '1 hour'
         and not exists (select 1 from public.portal_lembretes x where x.order_id = o.id and x.scheduled_at = o.scheduled_at and x.antes_horas = v_h) then
        insert into public.portal_lembretes (tenant_id, order_id, scheduled_at, antes_horas) values (o.tenant_id, o.id, o.scheduled_at, v_h);
        if v_chave is not null then
          perform net.http_post(url := 'https://vgkiddqahubznlzkxfgb.supabase.co/functions/v1/portal-avisos',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chave),
            body := jsonb_build_object('order_id', o.id, 'evento', 'lembrete', 'antes_horas', v_h), timeout_milliseconds := 30000);
        end if;
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end $$;
revoke execute on function public.enviar_lembretes_agendamento() from public, anon, authenticated;
do $$ begin perform cron.schedule('atos-lembretes-agendamento', '*/15 * * * *', 'select public.enviar_lembretes_agendamento()'); end $$;

-- ---------- funções do portal reescritas (datas com a regra da empresa; agendamento no chamado; ficha da equipe) ----------
create or replace function public.portal_abrir_chamado(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := (p->>'client_id')::uuid; v_perfil text; v_t uuid; v_tenant public.tenants; v_cfg jsonb;
  v_tipo text := p->>'tipo'; v_cat public.os_categorias; v_pai public.os_categorias; v_loc uuid := nullif(p->>'location_id', '')::uuid;
  v_titulo text := trim(coalesce(p->>'titulo', '')); v_desc text := trim(coalesce(p->>'descricao', ''));
  v_equipe uuid := nullif(p->>'equipe_id', '')::uuid; v_nequipes int; v_prio text := 'baixo'; v_informada text; v_imp text; v_urg text;
  v_pref jsonb := coalesce(p->'preferencias', '[]'::jsonb); v_item jsonb; v_anx jsonb; v_pessoa public.portal_pessoas;
  v_id uuid; v_num text; v_n int; v_prefix text; v_ncat int;
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

  insert into public.orders (tenant_id, client_id, location_id, title, description, tipo, categoria_id, priority, impacto, urgencia,
                             origem, solicitante_id, equipe_id, compartilhado_equipe, prioridade_informada, preferencia_agendamento)
  values (v_t, v_client, v_loc, v_titulo, v_desc, v_tipo, v_cat.id, v_prio, v_imp, v_urg,
          'portal', auth.uid(), v_equipe, coalesce((p->>'compartilhado')::boolean, true), v_informada, case when jsonb_array_length(v_pref) > 0 then v_pref end)
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

create or replace function public.portal_abertura_config(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid; v_cfg jsonb; v_prio text := public.portal_perfil_no_cliente(p_client); v_tenant public.tenants;
begin
  if v_prio is null then raise exception 'Sem acesso a este cliente.'; end if;
  select tenant_id into v_t from public.clients where id = p_client;
  select * into v_tenant from public.tenants where id = v_t;
  v_cfg := public.portal_abertura_efetiva(v_t);
  return jsonb_build_object(
    'perfil', v_prio,
    'tipos', coalesce((select jsonb_agg(jsonb_build_object('value', e.key, 'rotulo', e.value->>'rotulo', 'descricao', e.value->>'descricao')
                       order by case e.key when 'incidente' then 1 when 'requisicao' then 2 when 'visita' then 3 else 4 end)
                       from jsonb_each(v_cfg->'tipos') e
                      where (e.value->>'ativo')::boolean), '[]'::jsonb),   -- o tipo aparece sempre que a empresa o ativou; categorias são opcionais
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'pai', pai.nome, 'descricao', c.descricao_portal, 'tipos', c.tipos_portal) order by coalesce(pai.nome, c.nome), c.nome)
                              from public.os_categorias c left join public.os_categorias pai on pai.id = c.pai_id
                             where c.tenant_id = v_t and c.ativo and c.visivel_portal and cardinality(c.tipos_portal) > 0
                               and (c.pai_id is null or (pai.ativo and pai.visivel_portal))), '[]'::jsonb),
    'prioridade', jsonb_build_object('modo', v_tenant.prioridade_modo, 'matriz', v_tenant.prioridade_matriz,
                                     'solicitante_escolhe', (v_cfg#>>'{prioridade,solicitante_escolhe}')::boolean, 'descricoes', v_cfg#>'{prioridade,descricoes}'),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.name) order by l.name) from public.locations l where l.client_id = p_client), '[]'::jsonb),
    'equipes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome,
                          'unidades', coalesce((select jsonb_agg(u.location_id) from public.portal_equipe_unidades u where u.equipe_id = e.id), '[]'::jsonb)) order by e.nome)
                          from public.portal_equipes e join public.portal_equipe_membros m on m.equipe_id = e.id
                         where e.client_id = p_client and e.ativo and m.user_id = auth.uid()), '[]'::jsonb),
    'agendamento', public.agendamento_para_portal(v_t),
    'contatos', v_tenant.portal_contatos);
end $$;
revoke execute on function public.portal_abertura_config(uuid) from public, anon;
grant execute on function public.portal_abertura_config(uuid) to authenticated;

create or replace function public.portal_avisos_data(p_client uuid, p_location uuid, p_data date)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_t uuid; v_h uuid; v_ibge text; v_hf jsonb; v_avisos text[] := '{}'; v_fer text; v_min date; v_max date;
begin
  if public.portal_perfil_no_cliente(p_client) is null then raise exception 'Sem acesso a este cliente.'; end if;
  select tenant_id into v_t from public.clients where id = p_client;
  select id into v_h from public.horarios_atendimento where tenant_id = v_t and padrao;
  select cidade_ibge, horario_funcionamento into v_ibge, v_hf from public.locations where id = p_location and client_id = p_client;
  v_min := public.agendamento_data_minima(v_t); v_max := public.agendamento_data_maxima(v_t);
  if p_data < v_min then return 'Escolha uma data a partir de ' || to_char(v_min, 'DD/MM/YYYY') || ' (antecedência mínima da empresa).'; end if;
  if p_data > v_max then return 'Escolha uma data até ' || to_char(v_max, 'DD/MM/YYYY') || '.'; end if;
  if v_h is not null and not public.eh_dia_util(v_h, p_data, v_ibge) then
    select string_agg(f.nome, ', ') into v_fer from public.feriados_do_dia(v_t, p_data, v_ibge) f where f.efeito = 'folga';
    v_avisos := v_avisos || coalesce(v_fer, case extract(dow from p_data)::int when 0 then 'Domingo' when 6 then 'Sábado' else 'Sem expediente' end);
  end if;
  if v_hf is not null and jsonb_array_length(coalesce(v_hf -> extract(dow from p_data)::int::text, '[]'::jsonb)) = 0 then
    v_avisos := v_avisos || 'Unidade fechada'::text;
  end if;
  return nullif(array_to_string(v_avisos, ' · '), '');
end $$;
revoke execute on function public.portal_avisos_data(uuid, uuid, date) from public, anon;
grant execute on function public.portal_avisos_data(uuid, uuid, date) to authenticated;

create or replace function public.portal_obter_chamado(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; v_fuso text;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or not public.portal_ve_chamado(o) then raise exception 'Chamado não encontrado.'; end if;
  select coalesce(fuso_horario, 'America/Sao_Paulo') into v_fuso from public.tenants where id = o.tenant_id;
  return jsonb_build_object(
    'id', o.id, 'client_id', o.client_id, 'numero', o.number, 'titulo', o.title, 'descricao', o.description, 'tipo', o.tipo,
    'status', public.portal_status_cliente(o.status), 'criado_em', o.created_at, 'atualizado_em', o.updated_at,
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
