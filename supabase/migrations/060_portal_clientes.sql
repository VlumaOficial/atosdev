-- ============================================================
-- ATOS — Migration 060: portal — E3 clientes no portal
-- ============================================================
-- Desenho aprovado em 2026-10-08 (VISAO_ATOS.md 9.1, pontos 2, 6 e 10):
--   * portal ligado POR CLIENTE (a empresa liga; o Supervisor gerencia)
--   * perfis Supervisor e Usuário, equipes do cliente (com unidades opcionais)
--   * convite por e-mail (a pessoa cria a própria senha); quem já tem conta em
--     outro portal recebe o acesso sem criar senha nova
--   * desativar em vez de excluir
--   * "Solicitar acesso" (público, com anti-robô) → aprovação pelo Supervisor
--     do cliente ou pela empresa
--   * LGPD: exportar e anonimizar os dados de uma pessoa do portal
--
-- ISOLAMENTO: pessoas do portal continuam sem acesso às tabelas; tudo passa por
-- funções que conferem o papel (portal_papel_no_cliente: 'interno' = admin/gestor
-- da empresa, 'supervisor' = Supervisor ativo daquele cliente, ou nenhum).
-- ============================================================

alter table public.clients add column if not exists portal_ativo boolean not null default false;
alter table public.portal_plataforma add column if not exists turnstile_site_key text;   -- chave PÚBLICA do anti-robô (a secreta fica só na função)

-- ---------- equipes do cliente ----------
create table if not exists public.portal_equipes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists portal_equipes_nome_uk on public.portal_equipes (client_id, lower(trim(nome)));
create table if not exists public.portal_equipe_membros (
  equipe_id uuid not null references public.portal_equipes(id) on delete cascade,
  user_id uuid not null references public.portal_pessoas(user_id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  primary key (equipe_id, user_id)
);
create table if not exists public.portal_equipe_unidades (
  equipe_id uuid not null references public.portal_equipes(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  primary key (equipe_id, location_id)
);
alter table public.portal_equipes enable row level security;
alter table public.portal_equipe_membros enable row level security;
alter table public.portal_equipe_unidades enable row level security;
-- a equipe interna da empresa (admin/gestor) enxerga; as pessoas do portal só pelas funções
drop policy if exists portal_equipes_select on public.portal_equipes;
create policy portal_equipes_select on public.portal_equipes for select
  using (tenant_id = get_meu_tenant() and get_meu_role() in ('admin', 'gestor'));
drop policy if exists portal_equipe_membros_select on public.portal_equipe_membros;
create policy portal_equipe_membros_select on public.portal_equipe_membros for select
  using (tenant_id = get_meu_tenant() and get_meu_role() in ('admin', 'gestor'));

-- ---------- convites ----------
create table if not exists public.portal_convites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  email text not null check (email = lower(email)),
  nome text not null check (length(trim(nome)) between 2 and 120),
  perfil text not null check (perfil in ('supervisor', 'usuario')),
  equipes uuid[] not null default '{}',
  token_hash text not null unique,             -- só o hash fica no banco; o token vai no e-mail
  criado_por uuid,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_em timestamptz,
  revogado_em timestamptz,
  email_enviado_em timestamptz
);
create index if not exists portal_convites_email_idx on public.portal_convites (tenant_id, client_id, email);
alter table public.portal_convites enable row level security;
drop policy if exists portal_convites_select on public.portal_convites;
create policy portal_convites_select on public.portal_convites for select
  using (tenant_id = get_meu_tenant() and get_meu_role() in ('admin', 'gestor'));

-- ---------- solicitações de acesso ----------
create table if not exists public.portal_solicitacoes_acesso (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,     -- preenchido quando o nome informado confere com um cliente
  nome text not null check (length(trim(nome)) between 2 and 120),
  email text not null check (email = lower(email)),
  celular text,
  cliente_texto text check (cliente_texto is null or length(cliente_texto) <= 120),
  mensagem text check (mensagem is null or length(mensagem) <= 500),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aprovada', 'recusada')),
  decidido_por uuid,
  decidido_em timestamptz,
  motivo_recusa text,
  ip_hash text,
  criado_em timestamptz not null default now()
);
create index if not exists portal_solic_tenant_idx on public.portal_solicitacoes_acesso (tenant_id, situacao, criado_em desc);
create index if not exists portal_solic_ip_idx on public.portal_solicitacoes_acesso (ip_hash, criado_em);
alter table public.portal_solicitacoes_acesso enable row level security;
drop policy if exists portal_solic_select on public.portal_solicitacoes_acesso;
create policy portal_solic_select on public.portal_solicitacoes_acesso for select
  using (tenant_id = get_meu_tenant() and get_meu_role() in ('admin', 'gestor'));

-- ---------- avisos: novo tipo e destino ----------
alter table public.notificacoes add column if not exists link text;   -- caminho interno a abrir (quando não é uma OS)
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('sla_em_risco', 'sla_vencido', 'transferida', 'pingue_pongue', 'solicitacao_acesso'));

-- ---------- papel de quem consulta, em relação a um cliente ----------
create or replace function public.portal_papel_no_cliente(p_client uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_t uuid;
begin
  select tenant_id into v_t from public.clients where id = p_client;
  if v_t is null then return null; end if;
  if public.get_meu_role() in ('admin', 'gestor') and public.get_meu_tenant() = v_t then return 'interno'; end if;
  if exists (select 1 from public.portal_vinculos v
               join public.tenants t on t.id = v.tenant_id
               join public.clients c on c.id = v.client_id
              where v.user_id = auth.uid() and v.client_id = p_client and v.ativo and v.perfil = 'supervisor'
                and t.portal_habilitado and t.portal_ativo and c.portal_ativo and c.active) then
    return 'supervisor';
  end if;
  return null;
end $$;
revoke execute on function public.portal_papel_no_cliente(uuid) from public, anon;
grant execute on function public.portal_papel_no_cliente(uuid) to authenticated;

-- a empresa liga/desliga o portal de um cliente
create or replace function public.definir_portal_cliente(p_client uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.tenants;
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  select t.* into v_t from public.tenants t join public.clients c on c.tenant_id = t.id
   where c.id = p_client and t.id = public.get_meu_tenant();
  if v_t.id is null then raise exception 'Cliente não encontrado.'; end if;
  if not v_t.portal_habilitado then raise exception 'O portal ainda não foi habilitado pela VLUMA para a sua empresa.'; end if;
  update public.clients set portal_ativo = p_ativo where id = p_client;
  perform public.fn_portal_auditar(v_t.id, case when p_ativo then 'portal_cliente_ligado' else 'portal_cliente_desligado' end, jsonb_build_object('client_id', p_client));
end $$;
revoke execute on function public.definir_portal_cliente(uuid, boolean) from public, anon;
grant execute on function public.definir_portal_cliente(uuid, boolean) to authenticated;

-- tudo o que a tela de gestão de pessoas precisa, numa chamada (equipe interna ou Supervisor do cliente)
create or replace function public.portal_listar_gestao(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_papel text := public.portal_papel_no_cliente(p_client);
begin
  if v_papel is null then raise exception 'Sem permissão'; end if;
  return jsonb_build_object(
    'papel', v_papel,
    'portal_ativo', (select portal_ativo from public.clients where id = p_client),
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'nome', p.nome, 'email', p.email, 'celular', p.celular, 'perfil', v.perfil, 'ativo', v.ativo, 'desde', v.criado_em,
        'equipes', coalesce((select jsonb_agg(m.equipe_id) from public.portal_equipe_membros m join public.portal_equipes e on e.id = m.equipe_id
                              where m.user_id = v.user_id and e.client_id = p_client), '[]'::jsonb)) order by p.nome)
      from public.portal_vinculos v join public.portal_pessoas p on p.user_id = v.user_id
      where v.client_id = p_client and p.email not like '%@anonimizado.invalid'), '[]'::jsonb),   -- pessoas anonimizadas (LGPD) saem da lista
    'convites', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'email', c.email, 'perfil', c.perfil,
        'criado_em', c.criado_em, 'expira_em', c.expira_em, 'expirado', c.expira_em < now()) order by c.criado_em desc)
      from public.portal_convites c where c.client_id = p_client and c.aceito_em is null and c.revogado_em is null), '[]'::jsonb),
    'equipes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'ativo', e.ativo,
        'membros', coalesce((select jsonb_agg(m.user_id) from public.portal_equipe_membros m where m.equipe_id = e.id), '[]'::jsonb),
        'unidades', coalesce((select jsonb_agg(u.location_id) from public.portal_equipe_unidades u where u.equipe_id = e.id), '[]'::jsonb)) order by e.nome)
      from public.portal_equipes e where e.client_id = p_client), '[]'::jsonb),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.name) order by l.name) from public.locations l where l.client_id = p_client), '[]'::jsonb),
    'solicitacoes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'email', s.email, 'celular', s.celular,
        'cliente_texto', s.cliente_texto, 'mensagem', s.mensagem, 'criado_em', s.criado_em) order by s.criado_em)
      from public.portal_solicitacoes_acesso s where s.client_id = p_client and s.situacao = 'pendente'), '[]'::jsonb));
end $$;
revoke execute on function public.portal_listar_gestao(uuid) from public, anon;
grant execute on function public.portal_listar_gestao(uuid) to authenticated;

-- muda o perfil e/ou desativa (nunca exclui). O último Supervisor ativo só sai pela equipe interna.
create or replace function public.portal_alterar_vinculo(p_client uuid, p_user uuid, p_perfil text, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_papel text := public.portal_papel_no_cliente(p_client); v public.portal_vinculos; v_outros int;
begin
  if v_papel is null then raise exception 'Sem permissão'; end if;
  if p_perfil not in ('supervisor', 'usuario') then raise exception 'Perfil inválido.'; end if;
  select * into v from public.portal_vinculos where client_id = p_client and user_id = p_user;
  if v.id is null or exists (select 1 from public.portal_pessoas where user_id = p_user and email like '%@anonimizado.invalid') then
    raise exception 'Pessoa não encontrada neste cliente.';   -- inclui quem foi anonimizado (LGPD): não volta mais
  end if;
  if v_papel = 'supervisor' and p_user = auth.uid() then raise exception 'Você não pode alterar o seu próprio acesso. Peça a outro Supervisor ou à empresa.'; end if;
  if v.perfil = 'supervisor' and v.ativo and (p_perfil <> 'supervisor' or not p_ativo) and v_papel <> 'interno' then
    select count(*) into v_outros from public.portal_vinculos where client_id = p_client and perfil = 'supervisor' and ativo and user_id <> p_user;
    if v_outros = 0 then raise exception 'Este é o único Supervisor do cliente. Convide outro Supervisor antes, ou peça à empresa.'; end if;
  end if;
  update public.portal_vinculos set perfil = p_perfil, ativo = p_ativo,
         desativado_em = case when p_ativo then null else coalesce(desativado_em, now()) end,
         desativado_por = case when p_ativo then null else coalesce(desativado_por, auth.uid()) end
   where id = v.id;
  if not p_ativo then
    delete from public.portal_equipe_membros m using public.portal_equipes e
     where m.equipe_id = e.id and e.client_id = p_client and m.user_id = p_user;
  end if;
  perform public.fn_portal_auditar(v.tenant_id, case when not p_ativo then 'pessoa_desativada' when not v.ativo then 'pessoa_reativada' else 'pessoa_alterada' end,
    jsonb_build_object('client_id', p_client, 'user_id', p_user, 'perfil', p_perfil));
end $$;
revoke execute on function public.portal_alterar_vinculo(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.portal_alterar_vinculo(uuid, uuid, text, boolean) to authenticated;

-- cria/edita uma equipe do cliente (membros precisam ter acesso ativo; unidades são do cliente)
create or replace function public.portal_salvar_equipe(p_client uuid, p_id uuid, p_nome text, p_membros uuid[], p_unidades uuid[], p_ativo boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_papel text := public.portal_papel_no_cliente(p_client); v_t uuid; v_id uuid := p_id; u uuid;
begin
  if v_papel is null then raise exception 'Sem permissão'; end if;
  select tenant_id into v_t from public.clients where id = p_client;
  begin
    if p_id is null then
      insert into public.portal_equipes (tenant_id, client_id, nome, ativo) values (v_t, p_client, trim(p_nome), coalesce(p_ativo, true)) returning id into v_id;
    else
      update public.portal_equipes set nome = trim(p_nome), ativo = coalesce(p_ativo, true) where id = p_id and client_id = p_client;
      if not found then raise exception 'Equipe não encontrada.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe uma equipe com este nome.';
  end;
  foreach u in array coalesce(p_membros, '{}') loop
    if not exists (select 1 from public.portal_vinculos v where v.client_id = p_client and v.user_id = u and v.ativo) then
      raise exception 'Só pessoas com acesso ativo a este cliente podem ser membros.';
    end if;
  end loop;
  foreach u in array coalesce(p_unidades, '{}') loop
    if not exists (select 1 from public.locations l where l.id = u and l.client_id = p_client) then raise exception 'Unidade inválida.'; end if;
  end loop;
  delete from public.portal_equipe_membros where equipe_id = v_id;
  insert into public.portal_equipe_membros (equipe_id, user_id, tenant_id) select v_id, x, v_t from unnest(coalesce(p_membros, '{}')) x;
  delete from public.portal_equipe_unidades where equipe_id = v_id;
  insert into public.portal_equipe_unidades (equipe_id, location_id) select v_id, x from unnest(coalesce(p_unidades, '{}')) x;
  perform public.fn_portal_auditar(v_t, 'equipe_salva', jsonb_build_object('client_id', p_client, 'equipe_id', v_id));
  return v_id;
end $$;
revoke execute on function public.portal_salvar_equipe(uuid, uuid, text, uuid[], uuid[], boolean) from public, anon;
grant execute on function public.portal_salvar_equipe(uuid, uuid, text, uuid[], uuid[], boolean) to authenticated;

-- pedidos de acesso pendentes da empresa (equipe interna): os ligados a um cliente e os sem cliente definido
create or replace function public.portal_solicitacoes_empresa()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'email', s.email, 'celular', s.celular, 'cliente_texto', s.cliente_texto,
      'mensagem', s.mensagem, 'client_id', s.client_id, 'cliente', (select name from public.clients where id = s.client_id), 'criado_em', s.criado_em) order by s.criado_em)
    from public.portal_solicitacoes_acesso s where s.tenant_id = public.get_meu_tenant() and s.situacao = 'pendente'), '[]'::jsonb);
end $$;
revoke execute on function public.portal_solicitacoes_empresa() from public, anon;
grant execute on function public.portal_solicitacoes_empresa() to authenticated;

-- LGPD: exportação dos dados de uma pessoa do portal NESTA empresa (só o administrador)
create or replace function public.portal_exportar_pessoa(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public.get_meu_tenant(); v_email text;
begin
  if public.get_meu_role() <> 'admin' then raise exception 'Só o administrador da empresa exporta dados de pessoas do portal.'; end if;
  if not exists (select 1 from public.portal_vinculos where user_id = p_user and tenant_id = v_t) then raise exception 'Pessoa não encontrada nesta empresa.'; end if;
  select email into v_email from public.portal_pessoas where user_id = p_user;
  perform public.fn_portal_auditar(v_t, 'dados_exportados', jsonb_build_object('user_id', p_user));
  return jsonb_build_object(
    'exportado_em', now(), 'controladora', (select coalesce(nullif(trim(trade_name), ''), name) from public.tenants where id = v_t),
    'pessoa', (select jsonb_build_object('nome', nome, 'email', email, 'celular', celular, 'cadastrada_em', criado_em) from public.portal_pessoas where user_id = p_user),
    'acessos', (select coalesce(jsonb_agg(jsonb_build_object('cliente', c.name, 'perfil', v.perfil, 'ativo', v.ativo, 'desde', v.criado_em, 'desativado_em', v.desativado_em)), '[]'::jsonb)
                from public.portal_vinculos v join public.clients c on c.id = v.client_id where v.user_id = p_user and v.tenant_id = v_t),
    'equipes', (select coalesce(jsonb_agg(jsonb_build_object('cliente', c.name, 'equipe', e.nome)), '[]'::jsonb)
                from public.portal_equipe_membros m join public.portal_equipes e on e.id = m.equipe_id join public.clients c on c.id = e.client_id
                where m.user_id = p_user and m.tenant_id = v_t),
    'aceites', (select coalesce(jsonb_agg(jsonb_build_object('termo', t.tipo, 'versao', t.versao, 'aceito_em', a.aceito_em, 'canal', a.canal, 'retirado_em', a.revogado_em, 'ip', a.ip) order by a.aceito_em), '[]'::jsonb)
                from public.termos_aceites a join public.termos t on t.id = a.termo_id where a.user_id = p_user and a.tenant_id = v_t),
    'registros_de_acesso', (select coalesce(jsonb_agg(jsonb_build_object('acao', acao, 'em', em) order by em), '[]'::jsonb)
                from public.portal_auditoria where user_id = p_user and tenant_id = v_t),
    'convites', (select coalesce(jsonb_agg(jsonb_build_object('criado_em', criado_em, 'aceito_em', aceito_em, 'perfil', perfil)), '[]'::jsonb)
                from public.portal_convites where email = v_email and tenant_id = v_t),
    'pedidos_de_acesso', (select coalesce(jsonb_agg(jsonb_build_object('criado_em', criado_em, 'situacao', situacao, 'cliente_informado', cliente_texto, 'mensagem', mensagem)), '[]'::jsonb)
                from public.portal_solicitacoes_acesso where email = v_email and tenant_id = v_t));
end $$;
revoke execute on function public.portal_exportar_pessoa(uuid) from public, anon;
grant execute on function public.portal_exportar_pessoa(uuid) to authenticated;

-- chave pública do anti-robô (Super Admin)
create or replace function public.definir_turnstile(p_site_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.get_meu_role() <> 'super_admin' then raise exception 'Sem permissão'; end if;
  if p_site_key is not null and p_site_key !~ '^[0-9A-Za-z_-]{10,80}$' then raise exception 'Chave inválida.'; end if;
  update public.portal_plataforma set turnstile_site_key = nullif(trim(p_site_key), '');
end $$;
revoke execute on function public.definir_turnstile(text) from public, anon;
grant execute on function public.definir_turnstile(text) to authenticated;

-- config pública do portal passa a levar a chave do anti-robô
create or replace function public.portal_resolver(p_slug text default null, p_host text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_t public.tenants; v_slug text := lower(trim(p_slug)); v_host text := lower(trim(p_host));
  v_plat public.portal_plataforma; v_novo text; v_previa boolean := false; v_oficial text;
begin
  select * into v_plat from public.portal_plataforma limit 1;
  if v_host is not null and v_host <> '' then
    select t.* into v_t from public.portal_enderecos e join public.tenants t on t.id = e.tenant_id
     where e.host = v_host and e.situacao = 'ativo' limit 1;
    if v_t.id is null and v_plat.dominio_base is not null
       and v_host like v_plat.prefixo || '.%.' || v_plat.dominio_base then
      v_slug := substr(v_host, length(v_plat.prefixo) + 2, length(v_host) - length(v_plat.prefixo) - length(v_plat.dominio_base) - 2);
    end if;
  end if;
  if v_t.id is null and v_slug is not null and v_slug <> '' then
    select * into v_t from public.tenants where portal_slug = v_slug;
    if v_t.id is null then
      select t.portal_slug into v_novo from public.portal_slugs_antigos a join public.tenants t on t.id = a.tenant_id
       where a.slug = v_slug and a.valido_ate > now();
      if v_novo is not null then return jsonb_build_object('disponivel', false, 'redirecionar', v_novo); end if;
    end if;
  end if;
  if v_t.id is null then return jsonb_build_object('disponivel', false, 'motivo', 'nao_encontrado'); end if;
  if not (v_t.portal_habilitado and v_t.portal_ativo) then
    if v_t.id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor') then
      v_previa := true;
    else
      return jsonb_build_object('disponivel', false, 'motivo', 'indisponivel');
    end if;
  end if;
  select e.host into v_oficial from public.portal_enderecos e
   where e.tenant_id = v_t.id and e.situacao = 'ativo' and e.principal order by e.criado_em desc limit 1;
  return jsonb_build_object(
    'disponivel', true, 'previa', v_previa,
    'interno', public.get_meu_role() <> 'nenhum',
    'host_oficial', v_oficial,
    'turnstile_site_key', v_plat.turnstile_site_key,
    'tenant_id', v_t.id, 'slug', v_t.portal_slug,
    'nome', coalesce(nullif(trim(v_t.portal_nome), ''), 'Central de Atendimento ' || coalesce(nullif(trim(v_t.trade_name), ''), v_t.name)),
    'empresa', coalesce(nullif(trim(v_t.trade_name), ''), v_t.name),
    'cor', v_t.portal_cor, 'boas_vindas', v_t.portal_boas_vindas, 'contatos', v_t.portal_contatos,
    'logo_versao', v_t.portal_logo_versao,
    'termos', coalesce((select jsonb_agg(jsonb_build_object('tipo', x.tipo, 'titulo', x.titulo, 'versao', x.versao) order by x.tipo)
                        from public.portal_termos_vigentes(v_t.id) x), '[]'));
end $$;
revoke execute on function public.portal_resolver(text, text) from public;
grant execute on function public.portal_resolver(text, text) to anon, authenticated;

-- portal_config_plataforma também devolve a chave pública do anti-robô (Super Admin edita)
create or replace function public.portal_config_plataforma()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.get_meu_role() in ('super_admin', 'admin', 'gestor')
    then (select jsonb_build_object('dominio_base', dominio_base, 'prefixo', prefixo, 'turnstile_site_key', turnstile_site_key) from public.portal_plataforma limit 1) end
$$;
revoke execute on function public.portal_config_plataforma() from public, anon;
grant execute on function public.portal_config_plataforma() to authenticated;
