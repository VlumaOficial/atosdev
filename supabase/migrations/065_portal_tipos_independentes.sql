-- 065 — o tipo de chamado do portal depende só da configuração da empresa (Configurações › Abertura de chamados),
-- não de haver categoria visível. O assunto vira obrigatório apenas quando existem categorias para o tipo;
-- sem nenhuma, o chamado entra sem assunto e cai na fila de entrada (N1 classifica).
-- Antes (061): o cartão do tipo sumia sem categoria visível e o assunto era sempre obrigatório.
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
    'contatos', v_tenant.portal_contatos);
end $$;
revoke execute on function public.portal_abertura_config(uuid) from public, anon;
grant execute on function public.portal_abertura_config(uuid) to authenticated;

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
  for v_item in select * from jsonb_array_elements(v_pref) loop
    if v_item->>'data' is null or (v_item->>'data')::date <= current_date then raise exception 'As datas pedidas precisam ser futuras.'; end if;
    if coalesce(v_item->>'periodo', 'qualquer') not in ('manha', 'tarde', 'qualquer') then raise exception 'Período inválido.'; end if;
  end loop;

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
