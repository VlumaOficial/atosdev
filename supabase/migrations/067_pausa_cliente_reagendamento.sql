-- ============================================================
-- ATOS — Migration 067: portal E5b (parte 1) — pausa com o cliente, "Aguardando você" e reagendar pausando o SLA
-- ============================================================
-- * Motivos de pausa ganham COMPORTAMENTO com o cliente: "aciona" (Aguardando sua resposta; exige mensagem
--   pública; a resposta do cliente retoma a OS sozinha), "comunica" (texto + previsão de retorno) ou "interno"
--   (o cliente vê só "Em andamento"). Cadastráveis pelo admin/gestor, inclusive os novos.
-- * Previsão de retorno vencida avisa o responsável e os coordenadores (rotina a cada 15 minutos).
-- * Agendar/reagendar "a pedido do cliente" PAUSA o SLA até a nova data mantendo o tempo já gasto (antes a data
--   virava a base e o prazo recomeçava). Limite de agendamentos por chamado configurável (padrão 3; 0 = sem limite).
-- ATENÇÃO (PRD): o gatilho de aviso por e-mail tem a URL do DEV (como 030, 062 e 066); a rotina usa pg_cron.
-- ============================================================

-- ---------- motivos de pausa: comportamento com o cliente ----------
alter table public.motivos_pausa add column if not exists comportamento text not null default 'interno';
alter table public.motivos_pausa drop constraint if exists motivos_pausa_comportamento_check;
alter table public.motivos_pausa add constraint motivos_pausa_comportamento_check check (comportamento in ('interno', 'comunica', 'aciona'));
alter table public.motivos_pausa add column if not exists texto_cliente text check (texto_cliente is null or length(texto_cliente) <= 140);
alter table public.motivos_pausa add column if not exists exige_previsao boolean not null default false;

create or replace function public.fn_motivos_pausa_padrao(p_tenant uuid)
returns void language sql security definer as $$
  insert into public.motivos_pausa (tenant_id, nome, para_sla, ordem, comportamento, texto_cliente, exige_previsao) values
    (p_tenant, 'Aguardando o cliente', true, 1, 'aciona', 'Aguardando a sua resposta', false),
    (p_tenant, 'Acesso não liberado pelo cliente', true, 2, 'aciona', 'Precisamos que o acesso seja liberado', false),
    (p_tenant, 'Aguardando peça ou material', false, 3, 'comunica', 'Aguardando peça ou material', true),
    (p_tenant, 'Outro', false, 9, 'interno', null, false)
  on conflict do nothing
$$;
update public.motivos_pausa set comportamento = 'aciona', texto_cliente = coalesce(texto_cliente, 'Aguardando a sua resposta') where lower(trim(nome)) = 'aguardando o cliente' and comportamento = 'interno';
update public.motivos_pausa set comportamento = 'aciona', texto_cliente = coalesce(texto_cliente, 'Precisamos que o acesso seja liberado') where lower(trim(nome)) like 'acesso não liberado%' and comportamento = 'interno';
update public.motivos_pausa set comportamento = 'comunica', exige_previsao = true, texto_cliente = coalesce(texto_cliente, 'Aguardando peça ou material') where lower(trim(nome)) = 'aguardando peça ou material' and comportamento = 'interno';

-- ---------- limite de agendamentos a pedido do cliente por chamado ----------
alter table public.tenants add column if not exists sla_limite_reagendamentos int not null default 3 check (sla_limite_reagendamentos between 0 and 20);
create or replace function public.definir_limite_reagendamentos(p_limite int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão.'; end if;
  if p_limite is null or p_limite < 0 or p_limite > 20 then raise exception 'Informe de 0 a 20 (0 = sem limite).'; end if;
  update public.tenants set sla_limite_reagendamentos = p_limite where id = public.get_meu_tenant();
end $$;
revoke execute on function public.definir_limite_reagendamentos(int) from public, anon;
grant execute on function public.definir_limite_reagendamentos(int) to authenticated;

-- ---------- OS: campos da pausa e do crédito de agendamento ----------
alter table public.orders add column if not exists previsao_retorno timestamptz;
alter table public.orders add column if not exists aguardando_cliente_desde timestamptz;
alter table public.orders add column if not exists previsao_alertada_em timestamptz;
alter table public.orders add column if not exists sla_agend_min int not null default 0;          -- minutos de pausa por agendamentos a pedido do cliente (já acertados + aberto)
alter table public.orders add column if not exists sla_agend_aberto_min int not null default 0;   -- parte do crédito ainda em aberto (até a data agendada)
alter table public.orders add column if not exists sla_agend_desde timestamptz;
alter table public.orders add column if not exists sla_agend_ate timestamptz;
alter table public.orders add column if not exists reagendamentos int not null default 0;

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('sla_em_risco', 'sla_vencido', 'transferida', 'pingue_pongue', 'solicitacao_acesso', 'novo_chamado_portal', 'mensagem_cliente', 'previsao_vencida'));

-- ---------- pausa: o servidor exige o que o motivo pede ----------
create or replace function public.fn_orders_pausa_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
declare m public.motivos_pausa;
begin
  if tg_op <> 'UPDATE' then return new; end if;
  if new.status = 'pausada' and old.status <> 'pausada' then
    new.aguardando_cliente_desde := null; new.previsao_alertada_em := null;
    select * into m from public.motivos_pausa where id = new.pause_motivo_id;
    if m.id is not null then
      if m.exige_previsao then
        if new.previsao_retorno is null then raise exception 'Informe a previsão de retorno para este motivo de pausa.'; end if;
        if new.previsao_retorno <= now() then raise exception 'A previsão de retorno precisa ser uma data futura.'; end if;
      end if;
      if m.comportamento = 'aciona' and new.solicitante_id is not null then
        -- "aciona o cliente": a mensagem pública do que se pede tem de ter sido enviada agora há pouco (os_comentar 'cliente')
        if not exists (select 1 from public.order_comments c where c.order_id = new.id and c.visibilidade = 'cliente' and c.autor_portal_id is null
                          and c.user_id = auth.uid() and c.created_at > now() - interval '15 minutes') then
          raise exception 'Escreva a mensagem ao cliente (o que você precisa dele) antes de pausar com este motivo.';
        end if;
        new.aguardando_cliente_desde := now();
      end if;
    end if;
  elsif old.status = 'pausada' and new.status <> 'pausada' then
    new.aguardando_cliente_desde := null; new.previsao_retorno := null; new.previsao_alertada_em := null;
  elsif new.status = 'pausada' and old.status = 'pausada' and new.previsao_retorno is distinct from old.previsao_retorno then
    new.previsao_alertada_em := null;   -- nova previsão: o alerta de vencimento vale de novo
  end if;
  return new;
end $$;
revoke execute on function public.fn_orders_pausa_cliente() from public, anon, authenticated;
drop trigger if exists trg_orders_pausa_cliente on public.orders;
create trigger trg_orders_pausa_cliente before update on public.orders
  for each row execute function public.fn_orders_pausa_cliente();

-- ---------- SLA: crédito de pausa nos agendamentos a pedido do cliente ----------
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

-- ---------- aviso por e-mail também quando a pausa "comunica" (texto + previsão) ----------
create or replace function public.fn_orders_avisar_portal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_chave text; v_evento text;
begin
  if new.solicitante_id is null then return new; end if;
  if tg_op = 'INSERT' then
    v_evento := 'aberto';
  elsif new.status = 'pausada' and (old.status <> 'pausada' or new.previsao_retorno is distinct from old.previsao_retorno) then
    if exists (select 1 from public.motivos_pausa m where m.id = new.pause_motivo_id and m.comportamento = 'comunica') then v_evento := 'pausa'; end if;
  elsif new.status is distinct from old.status then
    v_evento := case new.status when 'agendada' then 'agendada' when 'em_andamento' then 'em_atendimento'
                                when 'concluida' then 'resolvido' when 'cancelada' then 'cancelado' else null end;
  elsif new.status = 'agendada' and new.scheduled_at is distinct from old.scheduled_at then
    v_evento := 'agendada';
  end if;
  if v_evento is null then return new; end if;
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'atos_service_role_key' limit 1;
  if v_chave is not null then
    perform net.http_post(
      url := 'https://vgkiddqahubznlzkxfgb.supabase.co/functions/v1/portal-avisos',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chave),
      body := jsonb_build_object('order_id', new.id, 'evento', v_evento),
      timeout_milliseconds := 30000);
  end if;
  return new;
end $$;
revoke execute on function public.fn_orders_avisar_portal() from public, anon, authenticated;
drop trigger if exists trg_orders_avisar_portal on public.orders;
create trigger trg_orders_avisar_portal after insert or update of status, scheduled_at, previsao_retorno on public.orders
  for each row execute function public.fn_orders_avisar_portal();

-- ---------- previsão de retorno vencida: avisa o responsável e os coordenadores ----------
create or replace function public.verificar_previsoes_pausa()
returns int language plpgsql security definer set search_path = public as $$
declare o record; v_n int := 0; v_avisados int; v_fuso text; v_titulo text; v_corpo text;
begin
  for o in select ord.*, c.name as cliente from public.orders ord left join public.clients c on c.id = ord.client_id
            where ord.status = 'pausada' and ord.previsao_retorno is not null and ord.previsao_retorno < now() and ord.previsao_alertada_em is null
  loop
    select fuso_horario into v_fuso from public.tenants where id = o.tenant_id;
    v_titulo := o.number || ' — previsão de retorno vencida';
    v_corpo := o.title || coalesce(' · ' || o.cliente, '') || ' · prevista para ' || to_char(o.previsao_retorno at time zone coalesce(v_fuso, 'America/Sao_Paulo'), 'DD/MM "às" HH24:MI');
    v_avisados := 0;
    insert into public.notificacoes (tenant_id, user_id, tipo, order_id, titulo, corpo)
    select o.tenant_id, u.id, 'previsao_vencida', o.id, v_titulo, v_corpo from public.users u
     where u.tenant_id = o.tenant_id and coalesce(u.active, true) and (u.id = o.technician_id
        or (o.grupo_id is not null and u.role <> 'tecnico' and exists (select 1 from public.grupo_membros m where m.grupo_id = o.grupo_id and m.user_id = u.id and m.coordenador)));
    get diagnostics v_avisados = row_count;
    if v_avisados = 0 then
      insert into public.notificacoes (tenant_id, user_id, tipo, order_id, titulo, corpo)
      select o.tenant_id, u.id, 'previsao_vencida', o.id, v_titulo, v_corpo from public.users u
       where u.tenant_id = o.tenant_id and u.role in ('admin', 'gestor') and coalesce(u.active, true);
    end if;
    update public.orders set previsao_alertada_em = now() where id = o.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.verificar_previsoes_pausa() from public, anon, authenticated;
do $$ begin perform cron.schedule('atos-previsoes-pausa', '*/15 * * * *', 'select public.verificar_previsoes_pausa()'); end $$;

-- ---------- portal: a resposta do cliente retoma a OS; pausa e "aguardando você" na lista e no chamado ----------
create or replace function public.portal_enviar_mensagem(p_order uuid, p_texto text, p_anexos jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_retomou boolean := false; v_txt text := trim(coalesce(p_texto, '')); v_pessoa public.portal_pessoas; v_id uuid; v_n int;
        v_prefix text; v_anx jsonb; v_dest uuid[]; v_titulo text; v_corpo text;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or not public.portal_ve_chamado(o) then raise exception 'Chamado não encontrado.'; end if;
  if not public.portal_termos_aceitos(o.tenant_id) then raise exception 'Aceite os termos de uso e o aviso de privacidade para enviar mensagens.'; end if;
  if o.status = 'cancelada' then raise exception 'Este chamado foi cancelado.'; end if;
  if length(v_txt) < 2 or length(v_txt) > 2000 then raise exception 'Escreva a mensagem (de 2 a 2000 caracteres).'; end if;
  select count(*) into v_n from public.order_comments where autor_portal_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_n >= 20 then raise exception 'Muitas mensagens em pouco tempo. Aguarde um pouco ou fale com a empresa.'; end if;
  if jsonb_typeof(coalesce(p_anexos, '[]'::jsonb)) <> 'array' then p_anexos := '[]'::jsonb; end if;
  if jsonb_array_length(p_anexos) > 3 then raise exception 'No máximo 3 arquivos por mensagem.'; end if;
  v_prefix := o.tenant_id::text || '/' || o.client_id::text || '/' || auth.uid()::text || '/';
  for v_anx in select * from jsonb_array_elements(p_anexos) loop
    if left(v_anx->>'path', length(v_prefix)) <> v_prefix or position('..' in v_anx->>'path') > 0 then raise exception 'Arquivo inválido.'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'portal-anexos' and name = v_anx->>'path') then raise exception 'Um dos arquivos não foi enviado.'; end if;
  end loop;
  select * into v_pessoa from public.portal_pessoas where user_id = auth.uid();

  insert into public.order_comments (tenant_id, order_id, user_id, author_name, comment, visibilidade, autor_portal_id)
  values (o.tenant_id, o.id, null, coalesce(v_pessoa.nome, 'Cliente'), v_txt, 'cliente', auth.uid()) returning id into v_id;
  for v_anx in select * from jsonb_array_elements(p_anexos) loop
    insert into public.os_anexos_cliente (tenant_id, order_id, path, nome, tipo, mime, bytes, por, comentario_id)
    values (o.tenant_id, o.id, v_anx->>'path', left(coalesce(v_anx->>'nome', 'arquivo'), 200), case when v_anx->>'tipo' = 'audio' then 'audio' else 'foto' end,
            coalesce(v_anx->>'mime', 'application/octet-stream'), least(greatest((v_anx->>'bytes')::int, 1), 10485760), auth.uid(), v_id);
  end loop;

  -- a resposta do cliente a uma pausa "aguardando você" retoma a OS sozinha (o relógio do SLA volta pelo gatilho)
  if o.status = 'pausada' and o.aguardando_cliente_desde is not null then
    update public.orders set status = 'em_andamento' where id = o.id;
    insert into public.order_events (tenant_id, order_id, event_type, actor_name, details)
    values (o.tenant_id, o.id, 'resumed', 'Portal — ' || coalesce(v_pessoa.nome, 'cliente'), jsonb_build_object('por', 'cliente', 'resposta_do_cliente', true));
    v_retomou := true;
  end if;

  -- avisa o responsável (técnico), os coordenadores do grupo; sem ninguém, admin/gestor/atendente
  v_titulo := o.number || case when v_retomou then ' — o cliente respondeu e a OS foi retomada' else ' — nova mensagem do cliente' end;
  v_corpo := coalesce(v_pessoa.nome, 'Cliente') || ': ' || left(v_txt, 120);
  select coalesce(array_agg(distinct u.id), '{}') into v_dest from public.users u
   where u.tenant_id = o.tenant_id and coalesce(u.active, true) and (
         u.id = o.technician_id
         or (o.grupo_id is not null and u.role <> 'tecnico' and exists (select 1 from public.grupo_membros m where m.grupo_id = o.grupo_id and m.user_id = u.id and m.coordenador)));
  if coalesce(array_length(v_dest, 1), 0) = 0 then
    select coalesce(array_agg(u.id), '{}') into v_dest from public.users u
     where u.tenant_id = o.tenant_id and u.role in ('admin', 'gestor', 'atendente') and coalesce(u.active, true);
  end if;
  insert into public.notificacoes (tenant_id, user_id, tipo, order_id, titulo, corpo)
  select o.tenant_id, d, 'mensagem_cliente', o.id, v_titulo, v_corpo from unnest(v_dest) d;
  return jsonb_build_object('id', v_id, 'retomou', v_retomou);
end $$;
revoke execute on function public.portal_enviar_mensagem(uuid, text, jsonb) from public, anon;
grant execute on function public.portal_enviar_mensagem(uuid, text, jsonb) to authenticated;

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
    'aguardando_voce', (o.status = 'pausada' and o.aguardando_cliente_desde is not null),
    -- pausa vista pelo cliente: "aciona" (Aguardando sua resposta), "comunica" (texto + previsão); "interno" não aparece
    'pausa', case when o.status = 'pausada' then (select case m.comportamento
                 when 'aciona' then jsonb_build_object('tipo', 'aciona', 'texto', coalesce(nullif(trim(m.texto_cliente), ''), 'Aguardando a sua resposta'), 'desde', o.aguardando_cliente_desde)
                 when 'comunica' then jsonb_build_object('tipo', 'comunica', 'texto', coalesce(nullif(trim(m.texto_cliente), ''), m.nome), 'previsao', o.previsao_retorno) end
               from public.motivos_pausa m where m.id = o.pause_motivo_id) end,
    -- só marcos que o cliente deve ver (sem notas internas, transferências ou nomes de pessoas)
    'linha_do_tempo', coalesce((select jsonb_agg(jsonb_build_object('evento', e.event_type, 'em', e.created_at, 'para', e.details->>'scheduled_at',
                                       'detalhe', case when e.event_type = 'reclassified' then jsonb_build_object('de', e.details->>'de', 'para', e.details->>'para', 'motivo', e.details->>'motivo', 'assunto', e.details->>'assunto') end)
                                       order by e.created_at)
                                  from public.order_events e where e.order_id = o.id and e.event_type in ('created', 'scheduled', 'started', 'completed', 'cancelled', 'reopened', 'reclassified')), '[]'::jsonb),
    'contatos', (select portal_contatos from public.tenants where id = o.tenant_id));
end $$;
revoke execute on function public.portal_obter_chamado(uuid) from public, anon;
grant execute on function public.portal_obter_chamado(uuid) to authenticated;

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
        'id', g.id, 'numero', g.number, 'titulo', g.title, 'tipo', g.tipo, 'status', public.portal_status_cliente(g.status),
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

-- ---------- ficha da equipe: desde quando aguarda o cliente, previsão e reagendamentos ----------
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
