-- ============================================================
-- ATOS — Migration 066: portal E5a — conversa com o cliente e triagem pelo N1
-- ============================================================
-- Conversa: cada comentário da OS passa a ter visibilidade — "interno" (nota interna, nunca
-- sai da empresa) ou "cliente" (resposta ao cliente, aparece no portal). O cliente também
-- responde pelo portal (texto + até 3 fotos). A 1ª resposta pública marca o SLA de resposta.
-- Triagem: o N1 (admin, gestor, atendente) confirma ou reclassifica a prioridade/assunto de
-- um chamado do portal, com motivo visível ao cliente; o SLA recalcula.
-- ATENÇÃO (PRD): o gatilho de aviso por e-mail tem a URL do DEV, como nas migrations 030 e 062.
-- ============================================================

-- ---------- visibilidade dos comentários ----------
alter table public.order_comments add column if not exists visibilidade text not null default 'interno';
alter table public.order_comments drop constraint if exists order_comments_visibilidade_check;
alter table public.order_comments add constraint order_comments_visibilidade_check check (visibilidade in ('interno', 'cliente'));
alter table public.order_comments add column if not exists autor_portal_id uuid references public.portal_pessoas(user_id) on delete set null;
create index if not exists order_comments_cliente_idx on public.order_comments (order_id, created_at) where visibilidade = 'cliente';

-- anexos que o cliente manda numa mensagem
alter table public.os_anexos_cliente add column if not exists comentario_id uuid references public.order_comments(id) on delete cascade;
create index if not exists os_anexos_cliente_comentario_idx on public.os_anexos_cliente (comentario_id) where comentario_id is not null;

-- a escrita direta na tabela só cria nota INTERNA; resposta ao cliente só pela função os_comentar
drop policy if exists order_comments_insert on public.order_comments;
create policy order_comments_insert on public.order_comments for insert
  with check (public.pode_ver_os(order_id) and (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant())
              and visibilidade = 'interno' and autor_portal_id is null);

-- editar o próprio comentário não pode trocar a visibilidade nem forjar autoria do cliente
create or replace function public.fn_order_comments_protege()
returns trigger language plpgsql as $$
begin
  if new.visibilidade is distinct from old.visibilidade or new.autor_portal_id is distinct from old.autor_portal_id then
    raise exception 'A visibilidade e a autoria do comentário não podem ser alteradas.';
  end if;
  return new;
end $$;
drop trigger if exists trg_order_comments_protege on public.order_comments;
create trigger trg_order_comments_protege before update on public.order_comments
  for each row execute function public.fn_order_comments_protege();

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('sla_em_risco', 'sla_vencido', 'transferida', 'pingue_pongue', 'solicitacao_acesso', 'novo_chamado_portal', 'mensagem_cliente'));

-- triagem: quem classificou e quando
alter table public.orders add column if not exists classificada_em timestamptz;
alter table public.orders add column if not exists classificada_por uuid references public.users(id) on delete set null;

-- ---------- equipe interna comenta (nota interna ou resposta ao cliente) ----------
create or replace function public.os_comentar(p_order uuid, p_texto text, p_visibilidade text default 'interno')
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_txt text := trim(coalesce(p_texto, '')); v_nome text; v_id uuid; v_role text := public.get_meu_role();
begin
  if auth.uid() is null or not public.pode_ver_os(p_order) then raise exception 'OS não encontrada.'; end if;
  select * into o from public.orders where id = p_order;
  if length(v_txt) < 1 or length(v_txt) > 4000 then raise exception 'Escreva o comentário (até 4000 caracteres).'; end if;
  if coalesce(p_visibilidade, '') not in ('interno', 'cliente') then raise exception 'Visibilidade inválida.'; end if;
  if p_visibilidade = 'cliente' then
    if v_role not in ('admin', 'gestor', 'atendente', 'tecnico') or o.tenant_id is distinct from public.get_meu_tenant() then
      raise exception 'Sem permissão para responder ao cliente.';
    end if;
    if o.solicitante_id is null then raise exception 'Esta OS não foi aberta pelo portal: não há cliente para responder.'; end if;
    if o.status = 'cancelada' then raise exception 'A OS está cancelada.'; end if;
    if length(v_txt) > 2000 then raise exception 'A resposta ao cliente pode ter até 2000 caracteres.'; end if;
  end if;
  select name into v_nome from public.users where id = auth.uid();
  insert into public.order_comments (tenant_id, order_id, user_id, author_name, comment, visibilidade)
  values (o.tenant_id, o.id, auth.uid(), coalesce(v_nome, 'Usuário'), v_txt, p_visibilidade) returning id into v_id;
  -- a 1ª resposta pública conta como a "resposta" do SLA
  if p_visibilidade = 'cliente' and o.respondido_em is null then update public.orders set respondido_em = now() where id = o.id; end if;
  return jsonb_build_object('id', v_id);
end $$;
revoke execute on function public.os_comentar(uuid, text, text) from public, anon;
grant execute on function public.os_comentar(uuid, text, text) to authenticated;

-- ---------- o cliente responde pelo portal ----------
create or replace function public.portal_enviar_mensagem(p_order uuid, p_texto text, p_anexos jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_txt text := trim(coalesce(p_texto, '')); v_pessoa public.portal_pessoas; v_id uuid; v_n int;
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

  -- avisa o responsável (técnico), os coordenadores do grupo; sem ninguém, admin/gestor/atendente
  v_titulo := o.number || ' — nova mensagem do cliente';
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
  return jsonb_build_object('id', v_id);
end $$;
revoke execute on function public.portal_enviar_mensagem(uuid, text, jsonb) from public, anon;
grant execute on function public.portal_enviar_mensagem(uuid, text, jsonb) to authenticated;

-- ---------- triagem pelo N1: confirmar ou reclassificar ----------
-- No modo MATRIZ a prioridade sai de Impacto × Urgência (o gatilho do SLA recalcula): o N1 ajusta
-- impacto e urgência. No modo SIMPLES ajusta a prioridade direto. Só o incidente tem prioridade ajustável.
drop function if exists public.os_triagem(uuid, text, text, uuid, text);
create or replace function public.os_triagem(p_order uuid, p_acao text, p_prioridade text default null, p_categoria uuid default null, p_motivo text default null,
                                             p_impacto text default null, p_urgencia text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_nome text; v_motivo text := nullif(trim(coalesce(p_motivo, '')), ''); v_cat public.os_categorias; v_t public.tenants;
        v_grupo uuid; v_mudou boolean := false; v_prio text; v_imp text; v_urg text; v_catn text; v_nova text;
begin
  if auth.uid() is null or public.get_meu_role() not in ('admin', 'gestor', 'atendente') then raise exception 'Sem permissão para fazer a triagem.'; end if;
  select * into o from public.orders where id = p_order and tenant_id = public.get_meu_tenant();
  if o.id is null then raise exception 'OS não encontrada.'; end if;
  if o.solicitante_id is null then raise exception 'A triagem vale para chamados abertos pelo portal.'; end if;
  if o.status in ('concluida', 'cancelada') then raise exception 'A OS já foi encerrada.'; end if;
  select * into v_t from public.tenants where id = o.tenant_id;
  select name into v_nome from public.users where id = auth.uid();

  if p_acao = 'confirmar' then
    update public.orders set classificada_em = now(), classificada_por = auth.uid(), respondido_em = coalesce(respondido_em, now()) where id = o.id;
    insert into public.order_events (tenant_id, order_id, event_type, actor_id, actor_name, details)
    values (o.tenant_id, o.id, 'classified', auth.uid(), v_nome, jsonb_build_object('prioridade', o.priority, 'acao', 'confirmada'));
    return jsonb_build_object('ok', true, 'acao', 'confirmada');
  elsif p_acao = 'reclassificar' then
    if v_motivo is null or length(v_motivo) < 3 then raise exception 'Informe o motivo (o cliente vê).'; end if;
    if length(v_motivo) > 300 then raise exception 'O motivo pode ter até 300 caracteres.'; end if;
    v_prio := o.priority; v_imp := o.impacto; v_urg := o.urgencia;
    if o.tipo = 'incidente' and v_t.prioridade_modo = 'matriz' then
      if p_prioridade is not null then raise exception 'Neste modo a prioridade vem do impacto e da urgência: informe os dois.'; end if;
      if (p_impacto is null) <> (p_urgencia is null) then raise exception 'Informe o impacto e a urgência.'; end if;
      if p_impacto is not null then
        if p_impacto not in ('alto', 'medio', 'baixo') or p_urgencia not in ('alta', 'media', 'baixa') then raise exception 'Impacto ou urgência inválidos.'; end if;
        if p_impacto is distinct from o.impacto or p_urgencia is distinct from o.urgencia then v_imp := p_impacto; v_urg := p_urgencia; v_mudou := true; end if;
      end if;
    elsif p_prioridade is not null and p_prioridade is distinct from o.priority then
      if o.tipo <> 'incidente' then raise exception 'Só o incidente tem prioridade ajustável.'; end if;
      if p_prioridade not in ('critico', 'alto', 'baixo') then raise exception 'Prioridade inválida.'; end if;
      v_prio := p_prioridade; v_mudou := true;
    end if;
    if p_categoria is not null and p_categoria is distinct from o.categoria_id then
      select * into v_cat from public.os_categorias where id = p_categoria and tenant_id = o.tenant_id and ativo;
      if v_cat.id is null then raise exception 'Assunto inválido.'; end if;
      v_catn := v_cat.nome;
      v_grupo := coalesce(v_cat.grupo_padrao_id, (select grupo_padrao_id from public.os_categorias where id = v_cat.pai_id));
      if v_grupo is not null and not exists (select 1 from public.grupos_atendimento g where g.id = v_grupo and g.tenant_id = o.tenant_id and g.ativo) then v_grupo := null; end if;
      v_mudou := true;
    end if;
    if not v_mudou then raise exception 'Nada mudou: escolha outra prioridade ou outro assunto, ou use Confirmar.'; end if;
    update public.orders set priority = v_prio, impacto = v_imp, urgencia = v_urg, categoria_id = coalesce(p_categoria, categoria_id), grupo_id = coalesce(v_grupo, grupo_id),
           classificada_em = now(), classificada_por = auth.uid(), respondido_em = coalesce(respondido_em, now())
     where id = o.id;
    select priority into v_nova from public.orders where id = o.id;   -- no modo matriz o gatilho do SLA recalculou
    insert into public.order_events (tenant_id, order_id, event_type, actor_id, actor_name, details)
    values (o.tenant_id, o.id, 'reclassified', auth.uid(), v_nome,
            jsonb_build_object('de', o.priority, 'para', v_nova, 'motivo', v_motivo, 'assunto', v_catn, 'impacto', v_imp, 'urgencia', v_urg,
                               'grupo_alterado', v_grupo is not null and v_grupo is distinct from o.grupo_id));
    return jsonb_build_object('ok', true, 'acao', 'reclassificada', 'prioridade', v_nova);
  end if;
  raise exception 'Ação inválida.';
end $$;
revoke execute on function public.os_triagem(uuid, text, text, uuid, text, text, text) from public, anon;
grant execute on function public.os_triagem(uuid, text, text, uuid, text, text, text) to authenticated;

-- ---------- o que a equipe vê do chamado do portal (agora com a triagem) ----------
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
    'afetados', 1 + (select count(*) from public.os_tambem_afeta a where a.order_id = o.id),
    'preferencias', o.preferencia_agendamento,
    'anexos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'nome', a.nome, 'tipo', a.tipo, 'mime', a.mime, 'bytes', a.bytes) order by a.criado_em)
                          from public.os_anexos_cliente a where a.order_id = o.id and a.comentario_id is null), '[]'::jsonb),
    'portal_host', (select e.host from public.portal_enderecos e where e.tenant_id = o.tenant_id and e.situacao = 'ativo' and e.principal order by e.criado_em desc limit 1));
end $$;
revoke execute on function public.portal_info_chamado(uuid) from public, anon;
grant execute on function public.portal_info_chamado(uuid) to authenticated;

-- ---------- o que o cliente vê do chamado (agora com a conversa e a reclassificação) ----------
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
    -- só marcos que o cliente deve ver (sem notas internas, transferências ou nomes de pessoas)
    'linha_do_tempo', coalesce((select jsonb_agg(jsonb_build_object('evento', e.event_type, 'em', e.created_at, 'para', e.details->>'scheduled_at',
                                       'detalhe', case when e.event_type = 'reclassified' then jsonb_build_object('de', e.details->>'de', 'para', e.details->>'para', 'motivo', e.details->>'motivo', 'assunto', e.details->>'assunto') end)
                                       order by e.created_at)
                                  from public.order_events e where e.order_id = o.id and e.event_type in ('created', 'scheduled', 'started', 'completed', 'cancelled', 'reopened', 'reclassified')), '[]'::jsonb),
    'contatos', (select portal_contatos from public.tenants where id = o.tenant_id));
end $$;
revoke execute on function public.portal_obter_chamado(uuid) from public, anon;
grant execute on function public.portal_obter_chamado(uuid) to authenticated;

-- ---------- aviso por e-mail: nova mensagem da empresa ----------
create or replace function public.fn_comentario_avisar_portal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_chave text;
begin
  if new.visibilidade <> 'cliente' or new.autor_portal_id is not null then return new; end if;
  if not exists (select 1 from public.orders where id = new.order_id and solicitante_id is not null) then return new; end if;
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'atos_service_role_key' limit 1;
  if v_chave is not null then
    perform net.http_post(
      url := 'https://vgkiddqahubznlzkxfgb.supabase.co/functions/v1/portal-avisos',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chave),
      body := jsonb_build_object('order_id', new.order_id, 'evento', 'mensagem', 'comment_id', new.id),
      timeout_milliseconds := 30000);
  end if;
  return new;
end $$;
revoke execute on function public.fn_comentario_avisar_portal() from public, anon, authenticated;
drop trigger if exists trg_comentario_avisar_portal on public.order_comments;
create trigger trg_comentario_avisar_portal after insert on public.order_comments
  for each row execute function public.fn_comentario_avisar_portal();
