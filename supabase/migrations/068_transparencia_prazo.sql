-- ============================================================
-- ATOS — Migration 068: portal E5b (parte 2) — transparência do prazo e "prazo explicado"
-- ============================================================
-- A empresa escolhe o que o cliente vê dos prazos: "oculto", "previsao" (padrão: previsão de atendimento e de solução em
-- data/hora) ou "completo" (+ no prazo / fora do prazo). Exceção por cliente. Visita não tem SLA: só "Agendado para…".
-- "Prazo explicado": o andamento mostra as pausas visíveis (aciona/comunica) e as retomadas, e os agendamentos a pedido do cliente.
-- ============================================================
alter table public.tenants add column if not exists sla_transparencia text not null default 'previsao';
alter table public.tenants drop constraint if exists tenants_sla_transparencia_check;
alter table public.tenants add constraint tenants_sla_transparencia_check check (sla_transparencia in ('oculto', 'previsao', 'completo'));
alter table public.clients add column if not exists sla_transparencia text;
alter table public.clients drop constraint if exists clients_sla_transparencia_check;
alter table public.clients add constraint clients_sla_transparencia_check check (sla_transparencia is null or sla_transparencia in ('oculto', 'previsao', 'completo'));

create or replace function public.portal_transparencia(o public.orders)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select sla_transparencia from public.clients where id = o.client_id), (select sla_transparencia from public.tenants where id = o.tenant_id), 'previsao')
$$;
revoke execute on function public.portal_transparencia(public.orders) from public, anon, authenticated;

create or replace function public.definir_transparencia_sla(p_nivel text, p_client uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.get_meu_role() <> 'admin' then raise exception 'Só o administrador da empresa define o que o cliente vê dos prazos.'; end if;
  if p_client is null then
    if coalesce(p_nivel, '') not in ('oculto', 'previsao', 'completo') then raise exception 'Escolha: oculto, previsão ou completo.'; end if;
    update public.tenants set sla_transparencia = p_nivel where id = public.get_meu_tenant();
  else
    if p_nivel is not null and p_nivel not in ('oculto', 'previsao', 'completo') then raise exception 'Escolha: oculto, previsão ou completo.'; end if;
    if not exists (select 1 from public.clients where id = p_client and tenant_id = public.get_meu_tenant()) then raise exception 'Cliente não encontrado.'; end if;
    update public.clients set sla_transparencia = p_nivel where id = p_client;   -- nulo = usar o padrão da empresa
  end if;
end $$;
revoke execute on function public.definir_transparencia_sla(text, uuid) from public, anon;
grant execute on function public.definir_transparencia_sla(text, uuid) to authenticated;

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
