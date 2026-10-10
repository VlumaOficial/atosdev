-- ============================================================
-- ATOS — Migration 070: portal E5b (parte 4) — cliente ausente, motivos de cancelamento e visita que gera chamado
-- ============================================================
-- * Motivos de cancelamento cadastráveis (como os de pausa). Os do sistema: "Cancelado pelo cliente" e "Cliente ausente"
--   (visita improdutiva). Cancelar uma OS passa a escolher um motivo da lista.
-- * "Cliente ausente": o técnico registra no app (hora e posição como prova; as fotos do local ficam nas Evidências);
--   a OS fica Cancelada como visita improdutiva; o cliente vê o motivo e pode "Pedir nova visita".
-- * Visita gera chamado: da Visita a equipe cria um Incidente ou uma Requisição LIGADOS ("relacionada a"). Orçamento
--   a partir deles está no backlog.
-- ============================================================
create table if not exists public.motivos_cancelamento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  codigo text check (codigo in ('cliente', 'ausente')),      -- motivos do sistema
  improdutiva boolean not null default false,                 -- conta como visita improdutiva (KPI) e deixa o cliente pedir nova visita
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create unique index if not exists motivos_cancelamento_nome_uk on public.motivos_cancelamento (tenant_id, lower(trim(nome)));
create unique index if not exists motivos_cancelamento_codigo_uk on public.motivos_cancelamento (tenant_id, codigo) where codigo is not null;
alter table public.motivos_cancelamento enable row level security;
drop policy if exists motivos_cancelamento_select on public.motivos_cancelamento;
create policy motivos_cancelamento_select on public.motivos_cancelamento for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
drop policy if exists motivos_cancelamento_write on public.motivos_cancelamento;
create policy motivos_cancelamento_write on public.motivos_cancelamento for all
  using (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'))
  with check (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'));

create or replace function public.fn_motivos_cancelamento_protege()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.codigo is not null then raise exception 'Este motivo é do sistema e não pode ser excluído.'; end if;
    return old;
  end if;
  if old.codigo is not null and (new.codigo is distinct from old.codigo or new.ativo = false) then raise exception 'Este motivo é do sistema e não pode ser desativado.'; end if;
  if old.codigo = 'ausente' and not new.improdutiva then raise exception '"Cliente ausente" sempre conta como visita improdutiva.'; end if;
  if old.codigo is null and new.codigo is not null then raise exception 'Código reservado ao sistema.'; end if;
  return new;
end $$;
drop trigger if exists trg_motivos_cancelamento_protege on public.motivos_cancelamento;
create trigger trg_motivos_cancelamento_protege before update or delete on public.motivos_cancelamento
  for each row execute function public.fn_motivos_cancelamento_protege();

create or replace function public.fn_motivos_cancelamento_padrao(p_tenant uuid)
returns void language sql security definer as $$
  insert into public.motivos_cancelamento (tenant_id, nome, codigo, improdutiva, ordem) values
    (p_tenant, 'Cancelado pelo cliente', 'cliente', false, 1),
    (p_tenant, 'Cliente ausente', 'ausente', true, 2),
    (p_tenant, 'Sem acesso ao local', null, true, 3),
    (p_tenant, 'Duplicado', null, false, 4),
    (p_tenant, 'Outro', null, false, 9)
  on conflict do nothing
$$;
create or replace function public.fn_tenant_motivos_cancelamento()
returns trigger language plpgsql security definer as $$
begin perform public.fn_motivos_cancelamento_padrao(new.id); return new; end $$;
drop trigger if exists trg_tenant_motivos_cancelamento on public.tenants;
create trigger trg_tenant_motivos_cancelamento after insert on public.tenants
  for each row execute function public.fn_tenant_motivos_cancelamento();
select public.fn_motivos_cancelamento_padrao(id) from public.tenants;

-- ---------- OS: motivo do cancelamento, visita improdutiva e vínculo "relacionada a" ----------
alter table public.orders add column if not exists cancel_motivo_id uuid references public.motivos_cancelamento(id) on delete set null;
alter table public.orders add column if not exists cliente_ausente_em timestamptz;
alter table public.orders add column if not exists improdutiva boolean not null default false;
alter table public.orders add column if not exists relacionada_a uuid references public.orders(id) on delete set null;
create index if not exists orders_relacionada_idx on public.orders (relacionada_a) where relacionada_a is not null;

create or replace function public.fn_orders_cancelamento()
returns trigger language plpgsql security definer set search_path = public as $$
declare m public.motivos_cancelamento;
begin
  if tg_op = 'UPDATE' and new.status = 'cancelada' and old.status <> 'cancelada' and new.cancel_motivo_id is not null then
    select * into m from public.motivos_cancelamento where id = new.cancel_motivo_id and tenant_id = new.tenant_id;
    if m.id is null or (not m.ativo and new.cancel_motivo_id is distinct from old.cancel_motivo_id) then raise exception 'Motivo de cancelamento inválido.'; end if;
    new.improdutiva := m.improdutiva;
    if m.codigo = 'ausente' then new.cliente_ausente_em := coalesce(new.cliente_ausente_em, now()); end if;
  end if;
  return new;
end $$;
revoke execute on function public.fn_orders_cancelamento() from public, anon, authenticated;
drop trigger if exists trg_orders_cancelamento on public.orders;
create trigger trg_orders_cancelamento before update on public.orders
  for each row execute function public.fn_orders_cancelamento();

-- ---------- visita gera chamado (Incidente ou Requisição ligados) ----------
create or replace function public.os_gerar_chamado(p_order uuid, p_tipo text, p_titulo text, p_descricao text, p_categoria uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_titulo text := trim(coalesce(p_titulo, '')); v_desc text := trim(coalesce(p_descricao, '')); v_id uuid; v_num text; v_nome text;
begin
  if auth.uid() is null or not public.pode_ver_os(p_order) or public.get_meu_role() not in ('admin', 'gestor', 'atendente', 'tecnico') then raise exception 'OS não encontrada.'; end if;
  select * into o from public.orders where id = p_order and tenant_id = public.get_meu_tenant();
  if o.id is null then raise exception 'OS não encontrada.'; end if;
  if o.tipo <> 'visita' then raise exception 'Só uma Visita gera chamado a partir dela.'; end if;
  if o.status = 'cancelada' then raise exception 'A visita foi cancelada.'; end if;
  if coalesce(p_tipo, '') not in ('incidente', 'requisicao') then raise exception 'Escolha Incidente ou Requisição.'; end if;
  if length(v_titulo) < 3 or length(v_titulo) > 120 then raise exception 'Informe um título de 3 a 120 caracteres.'; end if;
  if length(v_desc) < 10 or length(v_desc) > 4000 then raise exception 'Descreva o chamado (de 10 a 4000 caracteres).'; end if;
  if p_categoria is not null and not exists (select 1 from public.os_categorias c where c.id = p_categoria and c.tenant_id = o.tenant_id and c.ativo) then raise exception 'Assunto inválido.'; end if;
  insert into public.orders (tenant_id, client_id, location_id, title, description, tipo, priority, categoria_id, origem, solicitante_id, equipe_id, compartilhado_equipe, relacionada_a, created_by)
  values (o.tenant_id, o.client_id, o.location_id, v_titulo, v_desc, p_tipo, case when p_tipo = 'incidente' then 'baixo' else 'requisicao' end, p_categoria,
          case when o.solicitante_id is not null then 'portal' else 'interno' end, o.solicitante_id, o.equipe_id, o.compartilhado_equipe, o.id, auth.uid())
  returning id, number into v_id, v_num;
  select name into v_nome from public.users where id = auth.uid();
  insert into public.order_events (tenant_id, order_id, event_type, actor_id, actor_name, details)
  values (o.tenant_id, o.id, 'chamado_gerado', auth.uid(), v_nome, jsonb_build_object('order_id', v_id, 'numero', v_num, 'tipo', p_tipo));
  return jsonb_build_object('id', v_id, 'numero', v_num);
end $$;
revoke execute on function public.os_gerar_chamado(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.os_gerar_chamado(uuid, text, text, text, uuid) to authenticated;

-- ---------- cliente: pedir nova visita depois de uma visita não realizada ----------
create or replace function public.portal_pedir_nova_visita(p_order uuid, p_opcoes jsonb, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_pessoa public.portal_pessoas; v_id uuid; v_num text; v_obs text := nullif(trim(coalesce(p_obs, '')), ''); v_n int; v_titulo text; v_corpo text;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or not public.portal_ve_chamado(o) then raise exception 'Chamado não encontrado.'; end if;
  if not public.portal_termos_aceitos(o.tenant_id) then raise exception 'Aceite os termos de uso e o aviso de privacidade.'; end if;
  if o.tipo <> 'visita' or o.status <> 'cancelada' or not o.improdutiva then raise exception 'Só dá para pedir nova visita depois de uma visita que não foi realizada.'; end if;
  if exists (select 1 from public.orders r where r.relacionada_a = o.id and r.status not in ('cancelada', 'concluida')) then raise exception 'Já existe uma nova visita em andamento para este chamado.'; end if;
  if v_obs is not null and length(v_obs) > 500 then raise exception 'A observação pode ter até 500 letras.'; end if;
  if jsonb_array_length(coalesce(p_opcoes, '[]'::jsonb)) < 1 then raise exception 'Informe pelo menos uma data.'; end if;
  perform public.portal_validar_opcoes_data(o.tenant_id, p_opcoes);
  select count(*) into v_n from public.orders where solicitante_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_n >= 10 then raise exception 'Muitos chamados abertos em pouco tempo. Aguarde um pouco ou fale com a empresa.'; end if;
  select * into v_pessoa from public.portal_pessoas where user_id = auth.uid();
  insert into public.orders (tenant_id, client_id, location_id, title, description, tipo, priority, categoria_id, origem, solicitante_id, equipe_id, compartilhado_equipe, preferencia_agendamento, relacionada_a)
  values (o.tenant_id, o.client_id, o.location_id, left('Nova visita — ' || o.title, 120),
          'Nova visita pedida depois da visita não realizada ' || o.number || '.' || coalesce(chr(10) || v_obs, ''), 'visita', 'visita', o.categoria_id, 'portal', auth.uid(), o.equipe_id, o.compartilhado_equipe, p_opcoes, o.id)
  returning id, number into v_id, v_num;
  insert into public.order_events (tenant_id, order_id, event_type, actor_name, details)
  values (o.tenant_id, v_id, 'created', 'Portal — ' || coalesce(v_pessoa.nome, 'cliente'), jsonb_build_object('origem', 'portal', 'relacionada_a', o.number));
  v_titulo := v_num || ' — nova visita pedida pelo cliente'; v_corpo := o.title || ' · ' || coalesce(v_pessoa.nome, 'cliente') || ' · após ' || o.number;
  perform public.fn_avisar_responsaveis(v_id, 'novo_chamado_portal', v_titulo, v_corpo);
  return jsonb_build_object('id', v_id, 'numero', v_num);
end $$;
revoke execute on function public.portal_pedir_nova_visita(uuid, jsonb, text) from public, anon;
grant execute on function public.portal_pedir_nova_visita(uuid, jsonb, text) to authenticated;

-- ---------- funções reescritas ----------
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
  update public.orders set status = 'cancelada', cancel_reason = 'Cancelado pelo cliente' || coalesce(' — ' || v_motivo, ''),
         cancel_motivo_id = (select id from public.motivos_cancelamento where tenant_id = o.tenant_id and codigo = 'cliente') where id = o.id;
  insert into public.order_events (tenant_id, order_id, event_type, actor_name, details)
  values (o.tenant_id, o.id, 'cancelled', 'Portal — ' || coalesce(v_pessoa.nome, 'cliente'), jsonb_build_object('por', 'cliente', 'reason', v_motivo));
  perform public.fn_avisar_responsaveis(o.id, 'cancelamento_cliente', o.number || ' — cancelado pelo cliente', coalesce(v_pessoa.nome, 'Cliente') || coalesce(': ' || left(v_motivo, 100), ''));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.portal_cancelar_agendamento(uuid, text) from public, anon;
grant execute on function public.portal_cancelar_agendamento(uuid, text) to authenticated;

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
