-- ============================================================
-- ATOS — Migration 061: portal — E4 abrir e acompanhar chamado
-- ============================================================
-- Desenho aprovado em 2026-10-08 (VISAO_ATOS.md 9.1, pontos 2, 3, 4 e 6):
--   * o chamado do portal vira OS direto (origem "portal", sem técnico; o grupo
--     vem do catálogo) — duas entidades dobrariam o trabalho
--   * tipos em linguagem do cliente (a empresa escolhe quais aparecem e edita os
--     textos); só aparecem categorias marcadas como visíveis no portal
--   * prioridade: o solicitante informa (3 níveis ou 2 perguntas simples), o N1
--     confirma ou ajusta (a informada fica guardada)
--   * aviso de chamado parecido + "também me afeta"
--   * preferência de data (até 3), conferida contra o calendário da unidade
--   * foto e áudio na abertura
--   * visibilidade: o próprio chamado, os da equipe (se compartilhado) e, para o
--     Supervisor, todos os do cliente
--   * e-mails automáticos respeitando o consentimento e o canal escolhido
--
-- ISOLAMENTO: pessoas do portal continuam sem acesso às tabelas; tudo passa por
-- funções que conferem o vínculo ativo, o portal ligado (empresa e cliente) e a
-- regra de visibilidade. Só campos seguros saem (nada de notas internas, custos
-- ou dados do técnico além do nome).
-- ============================================================

-- ---------- colunas ----------
alter table public.orders add column if not exists origem text not null default 'interno'
  check (origem in ('interno', 'portal', 'whatsapp', 'email'));
alter table public.orders add column if not exists solicitante_id uuid references public.portal_pessoas(user_id) on delete set null;
alter table public.orders add column if not exists equipe_id uuid references public.portal_equipes(id) on delete set null;
alter table public.orders add column if not exists compartilhado_equipe boolean not null default true;
alter table public.orders add column if not exists prioridade_informada text;          -- o que o cliente escolheu (o N1 pode reclassificar)
alter table public.orders add column if not exists preferencia_agendamento jsonb;      -- [{"data":"2026-10-20","periodo":"manha"}]
create index if not exists orders_solicitante_idx on public.orders (solicitante_id) where solicitante_id is not null;
create index if not exists orders_origem_idx on public.orders (tenant_id, origem) where origem <> 'interno';

alter table public.tenants add column if not exists portal_abertura jsonb not null default '{}';
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('sla_em_risco', 'sla_vencido', 'transferida', 'pingue_pongue', 'solicitacao_acesso', 'novo_chamado_portal'));

create table if not exists public.os_anexos_cliente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  path text not null unique,
  nome text not null check (length(nome) between 1 and 200),
  tipo text not null check (tipo in ('foto', 'audio')),
  mime text not null,
  bytes int not null check (bytes between 1 and 10485760),
  por uuid references public.portal_pessoas(user_id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists os_anexos_cliente_order_idx on public.os_anexos_cliente (order_id);
alter table public.os_anexos_cliente enable row level security;
drop policy if exists os_anexos_cliente_select on public.os_anexos_cliente;
create policy os_anexos_cliente_select on public.os_anexos_cliente for select using (public.pode_ver_os(order_id));

create table if not exists public.os_tambem_afeta (
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.portal_pessoas(user_id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  em timestamptz not null default now(),
  primary key (order_id, user_id)
);
alter table public.os_tambem_afeta enable row level security;
drop policy if exists os_tambem_afeta_select on public.os_tambem_afeta;
create policy os_tambem_afeta_select on public.os_tambem_afeta for select using (public.pode_ver_os(order_id));

create table if not exists public.portal_preferencias (
  user_id uuid not null references public.portal_pessoas(user_id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  canal_email boolean not null default true,
  primary key (user_id, tenant_id)
);
alter table public.portal_preferencias enable row level security;

-- avisos já enviados (um por chamado e evento) — evita e-mail repetido
create table if not exists public.portal_avisos (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  evento text not null,
  enviado boolean not null default false,
  motivo text,
  detalhe text,
  em timestamptz not null default now(),
  unique (order_id, evento)
);
alter table public.portal_avisos enable row level security;

-- ---------- bucket dos anexos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-anexos', 'portal-anexos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------- apoio: vínculo, visibilidade, status ----------
-- perfil ativo da pessoa num cliente (portal e cliente ligados), ou nulo
create or replace function public.portal_perfil_no_cliente(p_client uuid)
returns text language sql stable security definer set search_path = public as $$
  select v.perfil from public.portal_vinculos v
    join public.tenants t on t.id = v.tenant_id
    join public.clients c on c.id = v.client_id
   where v.user_id = auth.uid() and v.client_id = p_client and v.ativo
     and t.portal_habilitado and t.portal_ativo and c.portal_ativo and c.active
$$;
revoke execute on function public.portal_perfil_no_cliente(uuid) from public, anon;
grant execute on function public.portal_perfil_no_cliente(uuid) to authenticated;

-- a pessoa do portal enxerga este chamado?
create or replace function public.portal_ve_chamado(o public.orders)
returns boolean language sql stable security definer set search_path = public as $$
  select public.portal_perfil_no_cliente(o.client_id) is not null and (
    public.portal_perfil_no_cliente(o.client_id) = 'supervisor'                        -- Supervisor: todos os chamados do cliente
    or o.solicitante_id = auth.uid()                                                   -- o próprio
    or exists (select 1 from public.os_tambem_afeta a where a.order_id = o.id and a.user_id = auth.uid())
    or (o.compartilhado_equipe and o.equipe_id is not null                             -- os da equipe (se compartilhados)
        and exists (select 1 from public.portal_equipe_membros m where m.equipe_id = o.equipe_id and m.user_id = auth.uid())))
$$;
revoke execute on function public.portal_ve_chamado(public.orders) from public, anon, authenticated;

create or replace function public.portal_pode_ver_chamado(p_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.portal_ve_chamado(o) from public.orders o where o.id = p_order), false)
$$;
revoke execute on function public.portal_pode_ver_chamado(uuid) from public, anon;
grant execute on function public.portal_pode_ver_chamado(uuid) to authenticated;

-- status na língua do cliente
create or replace function public.portal_status_cliente(p_status text)
returns text language sql immutable as $$
  select case p_status when 'aberta' then 'recebido' when 'agendada' then 'agendado'
                       when 'em_andamento' then 'em_atendimento' when 'pausada' then 'em_atendimento'
                       when 'concluida' then 'resolvido' when 'cancelada' then 'cancelado' else 'recebido' end
$$;

-- configuração de abertura da empresa, com padrões
create or replace function public.portal_abertura_efetiva(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c jsonb; r jsonb;
begin
  select portal_abertura into c from public.tenants where id = p_tenant;
  c := coalesce(c, '{}');
  r := jsonb_build_object(
    'tipos', jsonb_build_object(
      'incidente', jsonb_build_object('ativo', coalesce((c#>>'{tipos,incidente,ativo}')::boolean, true), 'rotulo', coalesce(nullif(c#>>'{tipos,incidente,rotulo}', ''), 'Relatar um problema'), 'descricao', coalesce(nullif(c#>>'{tipos,incidente,descricao}', ''), 'Algo parou ou está com defeito')),
      'requisicao', jsonb_build_object('ativo', coalesce((c#>>'{tipos,requisicao,ativo}')::boolean, true), 'rotulo', coalesce(nullif(c#>>'{tipos,requisicao,rotulo}', ''), 'Fazer uma solicitação'), 'descricao', coalesce(nullif(c#>>'{tipos,requisicao,descricao}', ''), 'Instalação, configuração, acesso ou troca')),
      'visita', jsonb_build_object('ativo', coalesce((c#>>'{tipos,visita,ativo}')::boolean, true), 'rotulo', coalesce(nullif(c#>>'{tipos,visita,rotulo}', ''), 'Solicitar visita técnica'), 'descricao', coalesce(nullif(c#>>'{tipos,visita,descricao}', ''), 'Avaliação, vistoria ou orçamento')),
      'preventiva', jsonb_build_object('ativo', coalesce((c#>>'{tipos,preventiva,ativo}')::boolean, true), 'rotulo', coalesce(nullif(c#>>'{tipos,preventiva,rotulo}', ''), 'Agendar manutenção preventiva'), 'descricao', coalesce(nullif(c#>>'{tipos,preventiva,descricao}', ''), 'Revisão planejada dos equipamentos'))),
    'prioridade', jsonb_build_object(
      'solicitante_escolhe', coalesce((c#>>'{prioridade,solicitante_escolhe}')::boolean, true),
      'descricoes', jsonb_build_object(
        'critico', coalesce(nullif(c#>>'{prioridade,descricoes,critico}', ''), 'Parou tudo: não consigo trabalhar'),
        'alto', coalesce(nullif(c#>>'{prioridade,descricoes,alto}', ''), 'Está atrapalhando, mas consigo trabalhar'),
        'baixo', coalesce(nullif(c#>>'{prioridade,descricoes,baixo}', ''), 'Pode esperar'))),
    'canais', jsonb_build_object('email', coalesce((c#>>'{canais,email}')::boolean, true)));
  return r;
end $$;
revoke execute on function public.portal_abertura_efetiva(uuid) from public, anon, authenticated;

-- a empresa edita os tipos, a prioridade e os canais do portal
create or replace function public.salvar_portal_abertura(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t text; v_tipos jsonb := '{}'::jsonb; v_desc jsonb := '{}'::jsonb; n text;
begin
  if public.get_meu_role() <> 'admin' then raise exception 'Só o administrador da empresa configura o portal.'; end if;
  foreach t in array array['incidente', 'requisicao', 'visita', 'preventiva'] loop
    if length(coalesce(p#>>array['tipos', t, 'rotulo'], '')) > 60 then raise exception 'O nome do tipo "%" tem mais de 60 caracteres.', t; end if;
    if length(coalesce(p#>>array['tipos', t, 'descricao'], '')) > 140 then raise exception 'A descrição do tipo "%" tem mais de 140 caracteres.', t; end if;
    v_tipos := v_tipos || jsonb_build_object(t, jsonb_build_object(
      'ativo', coalesce((p#>>array['tipos', t, 'ativo'])::boolean, true),
      'rotulo', nullif(trim(coalesce(p#>>array['tipos', t, 'rotulo'], '')), ''),
      'descricao', nullif(trim(coalesce(p#>>array['tipos', t, 'descricao'], '')), '')));
  end loop;
  if not exists (select 1 from jsonb_each(v_tipos) e where (e.value->>'ativo')::boolean) then
    raise exception 'Deixe pelo menos um tipo de chamado ativo.';
  end if;
  foreach n in array array['critico', 'alto', 'baixo'] loop
    if length(coalesce(p#>>array['prioridade', 'descricoes', n], '')) > 140 then raise exception 'A descrição do nível "%" tem mais de 140 caracteres.', n; end if;
    v_desc := v_desc || jsonb_build_object(n, nullif(trim(coalesce(p#>>array['prioridade', 'descricoes', n], '')), ''));
  end loop;
  update public.tenants set portal_abertura = jsonb_build_object(
    'tipos', v_tipos,
    'prioridade', jsonb_build_object('solicitante_escolhe', coalesce((p#>>'{prioridade,solicitante_escolhe}')::boolean, true), 'descricoes', v_desc),
    'canais', jsonb_build_object('email', coalesce((p#>>'{canais,email}')::boolean, true)))
   where id = public.get_meu_tenant();
  perform public.fn_portal_auditar(public.get_meu_tenant(), 'abertura_configurada', '{}');
end $$;
revoke execute on function public.salvar_portal_abertura(jsonb) from public, anon;
grant execute on function public.salvar_portal_abertura(jsonb) to authenticated;

-- ---------- o que a tela de abertura precisa ----------
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
                      where (e.value->>'ativo')::boolean
                        and exists (select 1 from public.os_categorias c left join public.os_categorias pai on pai.id = c.pai_id
                                     where c.tenant_id = v_t and c.ativo and c.visivel_portal and e.key = any (c.tipos_portal)
                                       and (c.pai_id is null or (pai.ativo and pai.visivel_portal)))), '[]'::jsonb),
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

-- aviso do calendário da unidade para uma data pedida (feriado, fim de semana, unidade fechada)
create or replace function public.portal_avisos_data(p_client uuid, p_location uuid, p_data date)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_t uuid; v_h uuid; v_ibge text; v_hf jsonb; v_avisos text[] := '{}'; v_fer text;
begin
  if public.portal_perfil_no_cliente(p_client) is null then raise exception 'Sem acesso a este cliente.'; end if;
  select tenant_id into v_t from public.clients where id = p_client;
  select id into v_h from public.horarios_atendimento where tenant_id = v_t and padrao;
  select cidade_ibge, horario_funcionamento into v_ibge, v_hf from public.locations where id = p_location and client_id = p_client;
  if p_data <= current_date then return 'A data precisa ser futura.'; end if;
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

-- chamados parecidos (mesma unidade e assunto, em aberto): evita abrir o mesmo problema duas vezes
create or replace function public.portal_chamados_parecidos(p_client uuid, p_location uuid, p_categoria uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.portal_perfil_no_cliente(p_client) is null then raise exception 'Sem acesso a este cliente.'; end if;
  return coalesce((select jsonb_agg(x order by x->>'criado_em' desc) from (
    select jsonb_build_object('id', o.id, 'numero', o.number, 'titulo', o.title, 'status', public.portal_status_cliente(o.status),
             'criado_em', o.created_at, 'afetados', 1 + (select count(*) from public.os_tambem_afeta a where a.order_id = o.id),
             'meu', public.portal_ve_chamado(o)) x
      from public.orders o
     where o.client_id = p_client and o.location_id = p_location and o.status not in ('concluida', 'cancelada')
       and o.tipo = 'incidente' and o.created_at > now() - interval '30 days'
       and (o.categoria_id = p_categoria
            or o.categoria_id in (select id from public.os_categorias where pai_id = p_categoria)
            or o.categoria_id in (select pai_id from public.os_categorias where id = p_categoria and pai_id is not null))
     limit 5) q), '[]'::jsonb);
end $$;
revoke execute on function public.portal_chamados_parecidos(uuid, uuid, uuid) from public, anon;
grant execute on function public.portal_chamados_parecidos(uuid, uuid, uuid) to authenticated;

create or replace function public.portal_tambem_afeta(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or public.portal_perfil_no_cliente(o.client_id) is null then raise exception 'Chamado não encontrado.'; end if;
  if o.status in ('concluida', 'cancelada') then raise exception 'Este chamado já foi encerrado.'; end if;
  insert into public.os_tambem_afeta (order_id, user_id, tenant_id) values (o.id, auth.uid(), o.tenant_id) on conflict do nothing;
  perform public.fn_portal_auditar(o.tenant_id, 'tambem_afeta', jsonb_build_object('order_id', o.id));
end $$;
revoke execute on function public.portal_tambem_afeta(uuid) from public, anon;
grant execute on function public.portal_tambem_afeta(uuid) to authenticated;

-- os termos obrigatórios vigentes (uso e privacidade) foram aceitos por quem consulta?
create or replace function public.portal_termos_aceitos(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.portal_termos_vigentes(p_tenant) x
     where x.tipo in ('uso', 'privacidade')
       and not exists (select 1 from public.termos_aceites a where a.user_id = auth.uid() and a.tenant_id = p_tenant and a.termo_id = x.id and a.revogado_em is null))
$$;
revoke execute on function public.portal_termos_aceitos(uuid) from public, anon;
grant execute on function public.portal_termos_aceitos(uuid) to authenticated;

-- ---------- abrir o chamado ----------
-- p: {client_id, tipo, categoria_id, location_id, titulo, descricao, equipe_id?, compartilhado?,
--     nivel? (modo simples), impacto?/urgencia? (modo matriz), preferencias?[{data,periodo}], anexos?[{path,nome,tipo,mime,bytes}]}
create or replace function public.portal_abrir_chamado(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := (p->>'client_id')::uuid; v_perfil text; v_t uuid; v_tenant public.tenants; v_cfg jsonb;
  v_tipo text := p->>'tipo'; v_cat public.os_categorias; v_pai public.os_categorias; v_loc uuid := nullif(p->>'location_id', '')::uuid;
  v_titulo text := trim(coalesce(p->>'titulo', '')); v_desc text := trim(coalesce(p->>'descricao', ''));
  v_equipe uuid := nullif(p->>'equipe_id', '')::uuid; v_nequipes int; v_prio text := 'baixo'; v_informada text; v_imp text; v_urg text;
  v_pref jsonb := coalesce(p->'preferencias', '[]'::jsonb); v_item jsonb; v_anx jsonb; v_pessoa public.portal_pessoas;
  v_id uuid; v_num text; v_n int; v_prefix text;
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

  select * into v_cat from public.os_categorias where id = (p->>'categoria_id')::uuid and tenant_id = v_t and ativo and visivel_portal and v_tipo = any (tipos_portal);
  if v_cat.id is null then raise exception 'Escolha um assunto da lista.'; end if;
  if v_cat.pai_id is not null then
    select * into v_pai from public.os_categorias where id = v_cat.pai_id;
    if not coalesce(v_pai.ativo and v_pai.visivel_portal, false) then raise exception 'Escolha um assunto da lista.'; end if;   -- pai oculto/indefinido esconde a filha
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

-- ---------- acompanhar ----------
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
      'todos', (select count(*) from vis)),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'numero', g.number, 'titulo', g.title, 'tipo', g.tipo, 'status', public.portal_status_cliente(g.status),
        'criado_em', g.created_at, 'atualizado_em', g.updated_at,
        'cliente', (select name from public.clients where id = g.client_id),
        'unidade', (select name from public.locations where id = g.location_id),
        'categoria', (select nome from public.os_categorias where id = g.categoria_id),
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
    'id', o.id, 'numero', o.number, 'titulo', o.title, 'descricao', o.description, 'tipo', o.tipo,
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
    'anexos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'nome', a.nome, 'tipo', a.tipo, 'mime', a.mime, 'bytes', a.bytes) order by a.criado_em) from public.os_anexos_cliente a where a.order_id = o.id), '[]'::jsonb),
    -- só marcos que o cliente deve ver (sem notas internas, transferências ou nomes de pessoas)
    'linha_do_tempo', coalesce((select jsonb_agg(jsonb_build_object('evento', e.event_type, 'em', e.created_at, 'para', e.details->>'scheduled_at') order by e.created_at)
                                  from public.order_events e where e.order_id = o.id and e.event_type in ('created', 'scheduled', 'started', 'completed', 'cancelled', 'reopened')), '[]'::jsonb),
    'contatos', (select portal_contatos from public.tenants where id = o.tenant_id));
end $$;
revoke execute on function public.portal_obter_chamado(uuid) from public, anon;
grant execute on function public.portal_obter_chamado(uuid) to authenticated;

-- ---------- preferências de aviso ----------
create or replace function public.portal_minhas_preferencias(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cfg jsonb;
begin
  if not public.portal_tem_vinculo(p_tenant) then raise exception 'Sem acesso a este portal.'; end if;
  v_cfg := public.portal_abertura_efetiva(p_tenant);
  return jsonb_build_object(
    'canal_email', coalesce((select canal_email from public.portal_preferencias where user_id = auth.uid() and tenant_id = p_tenant), true),
    'email_liberado', (v_cfg#>>'{canais,email}')::boolean,
    'whatsapp_liberado', false,
    'email', (select email from public.portal_pessoas where user_id = auth.uid()),
    'celular', (select celular from public.portal_pessoas where user_id = auth.uid()),
    'aceite_comunicacao', exists (select 1 from public.termos_aceites a join public.termos t on t.id = a.termo_id
                                   where a.user_id = auth.uid() and a.tenant_id = p_tenant and t.tipo = 'comunicacao' and a.revogado_em is null),
    'empresa', (select coalesce(nullif(trim(trade_name), ''), name) from public.tenants where id = p_tenant));
end $$;
revoke execute on function public.portal_minhas_preferencias(uuid) from public, anon;
grant execute on function public.portal_minhas_preferencias(uuid) to authenticated;

-- email: liga/desliga o canal; o consentimento de comunicação pode ser dado ou retirado aqui (LGPD)
create or replace function public.portal_salvar_preferencias(p_tenant uuid, p_email boolean, p_celular text default null, p_consentimento boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_termo uuid; v_cel text := nullif(regexp_replace(coalesce(p_celular, ''), '\D', '', 'g'), '');
begin
  if not public.portal_tem_vinculo(p_tenant) then raise exception 'Sem acesso a este portal.'; end if;
  if v_cel is not null and length(v_cel) not between 10 and 13 then raise exception 'Celular inválido: informe DDD e número.'; end if;
  insert into public.portal_preferencias (user_id, tenant_id, canal_email) values (auth.uid(), p_tenant, coalesce(p_email, true))
  on conflict (user_id, tenant_id) do update set canal_email = excluded.canal_email;
  if p_celular is not null then update public.portal_pessoas set celular = v_cel where user_id = auth.uid(); end if;
  if p_consentimento is not null then
    select id into v_termo from public.portal_termos_vigentes(p_tenant) where tipo = 'comunicacao';
    if v_termo is not null then
      if p_consentimento then
        update public.termos_aceites set revogado_em = null where user_id = auth.uid() and tenant_id = p_tenant and termo_id = v_termo;
        if not found then insert into public.termos_aceites (user_id, tenant_id, termo_id, canal) values (auth.uid(), p_tenant, v_termo, 'portal'); end if;
      else
        update public.termos_aceites set revogado_em = coalesce(revogado_em, now()) where user_id = auth.uid() and tenant_id = p_tenant
          and termo_id in (select id from public.termos where tipo = 'comunicacao');
        if not found then insert into public.termos_aceites (user_id, tenant_id, termo_id, canal, revogado_em) values (auth.uid(), p_tenant, v_termo, 'portal', now()); end if;
      end if;
    end if;
  end if;
  perform public.fn_portal_auditar(p_tenant, 'preferencias_salvas', jsonb_build_object('email', p_email, 'consentimento', p_consentimento));
end $$;
revoke execute on function public.portal_salvar_preferencias(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.portal_salvar_preferencias(uuid, boolean, text, boolean) to authenticated;

-- ---------- equipe interna: o que sabe do chamado do portal ----------
create or replace function public.portal_info_chamado(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; v_interno boolean := public.get_meu_role() in ('admin', 'gestor', 'atendente');
begin
  if not public.pode_ver_os(p_order) then raise exception 'OS não encontrada.'; end if;
  select * into o from public.orders where id = p_order;
  if o.origem = 'interno' and o.solicitante_id is null then return null; end if;
  return jsonb_build_object(
    'origem', o.origem,
    'solicitante', (select jsonb_build_object('nome', p.nome, 'email', case when v_interno then p.email end, 'celular', case when v_interno then p.celular end)
                      from public.portal_pessoas p where p.user_id = o.solicitante_id),
    'equipe', (select nome from public.portal_equipes where id = o.equipe_id),
    'compartilhado', o.compartilhado_equipe,
    'prioridade_informada', o.prioridade_informada,
    'afetados', 1 + (select count(*) from public.os_tambem_afeta a where a.order_id = o.id),
    'preferencias', o.preferencia_agendamento,
    'anexos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'nome', a.nome, 'tipo', a.tipo, 'mime', a.mime, 'bytes', a.bytes) order by a.criado_em)
                          from public.os_anexos_cliente a where a.order_id = o.id), '[]'::jsonb),
    'portal', (select coalesce(nullif(portal_slug, ''), null) from public.tenants where id = o.tenant_id));
end $$;
revoke execute on function public.portal_info_chamado(uuid) from public, anon;
grant execute on function public.portal_info_chamado(uuid) to authenticated;

-- ---------- storage: quem envia e quem lê os anexos ----------
create or replace function public.portal_pode_enviar_anexo(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v text[] := string_to_array(p_name, '/');
begin
  if auth.uid() is null or array_length(v, 1) <> 4 or position('..' in p_name) > 0 then return false; end if;
  return v[3] = auth.uid()::text
     and exists (select 1 from public.clients c where c.id::text = v[2] and c.tenant_id::text = v[1])
     and public.portal_perfil_no_cliente(v[2]::uuid) is not null;
end $$;
revoke execute on function public.portal_pode_enviar_anexo(text) from public, anon;
grant execute on function public.portal_pode_enviar_anexo(text) to authenticated;

create or replace function public.portal_pode_ler_anexo(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v text[] := string_to_array(p_name, '/'); v_order uuid;
begin
  if auth.uid() is null or array_length(v, 1) <> 4 then return false; end if;
  if v[3] = auth.uid()::text then return true; end if;                       -- o próprio arquivo
  select order_id into v_order from public.os_anexos_cliente where path = p_name;
  if v_order is null then return false; end if;
  return public.pode_ver_os(v_order) or public.portal_pode_ver_chamado(v_order);   -- equipe interna / técnico / quem vê o chamado
end $$;
revoke execute on function public.portal_pode_ler_anexo(text) from public, anon;
grant execute on function public.portal_pode_ler_anexo(text) to authenticated;

drop policy if exists portal_anexos_insert on storage.objects;
create policy portal_anexos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-anexos' and public.portal_pode_enviar_anexo(name));
drop policy if exists portal_anexos_select on storage.objects;
create policy portal_anexos_select on storage.objects for select to authenticated
  using (bucket_id = 'portal-anexos' and public.portal_pode_ler_anexo(name));
drop policy if exists portal_anexos_delete on storage.objects;
create policy portal_anexos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portal-anexos' and (storage.foldername(name))[3] = auth.uid()::text
         and not exists (select 1 from public.os_anexos_cliente a where a.path = name));    -- rascunhos: só quem enviou e ainda não virou chamado
