-- ============================================================
-- ATOS — Migration 051: Portal de atendimento — E1 (fundação)
-- ============================================================
-- Desenho aprovado pelo usuário em 2026-10-08 (VISAO_ATOS.md 9.1, pontos
-- 1–11). Esta migration cria a base da Etapa 1, entrega E1:
--   * configuração do portal na empresa (habilitado pelo Super Admin;
--     identidade, nome curto e ativação pela empresa)
--   * endereços do portal (subdomínio VLUMA / domínio próprio) e nomes
--     curtos antigos (redirecionam por 90 dias)
--   * pessoas do portal e vínculos pessoa ↔ cliente (uma pessoa pode estar
--     em vários portais e em vários clientes)
--   * termos versionados (padrão VLUMA + texto próprio da empresa) e aceites
--   * auditoria do portal
--   * bucket público só para a logo do portal
--
-- ISOLAMENTO (ponto 10): pessoas do portal NÃO estão em public.users (a 048
-- impede o gatilho de criá-las lá), então get_meu_tenant()/get_meu_role()
-- são nulos para elas e TODAS as regras de acesso existentes já as
-- bloqueiam. As tabelas novas também não têm regra de leitura para elas:
-- o portal só conversa com o banco por funções próprias (portal_*), que
-- devolvem apenas campos seguros.
-- ============================================================

-- ---------- empresa ----------
alter table public.tenants add column if not exists portal_habilitado boolean not null default false;  -- Super Admin (plano)
alter table public.tenants add column if not exists portal_ativo boolean not null default false;       -- a empresa liga quando estiver pronta
alter table public.tenants add column if not exists portal_slug text;                                  -- nome curto
alter table public.tenants add column if not exists portal_nome text;                                  -- "Central de Atendimento Infoxtec"
alter table public.tenants add column if not exists portal_cor text;                                   -- #RRGGBB
alter table public.tenants add column if not exists portal_boas_vindas text;
alter table public.tenants add column if not exists portal_contatos jsonb not null default '{}';       -- {email, telefone, whatsapp, site}
alter table public.tenants add column if not exists portal_termos_proprios text[] not null default '{}'; -- tipos com texto próprio
alter table public.tenants add column if not exists portal_logo_versao bigint;                         -- cache da logo pública
do $$ begin
  alter table public.tenants add constraint tenants_portal_cor_ck check (portal_cor is null or portal_cor ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tenants add constraint tenants_portal_boas_vindas_ck check (portal_boas_vindas is null or length(portal_boas_vindas) <= 500);
exception when duplicate_object then null; end $$;
create unique index if not exists tenants_portal_slug_uk on public.tenants (portal_slug) where portal_slug is not null;

-- nome curto: minúsculas, sem acento, 3–30, hífen só no meio, nomes reservados
create or replace function public.portal_slug_erro(p text)
returns text language sql immutable as $$
  select case
    when p is null or p = '' then 'Informe o nome curto.'
    when length(p) < 3 or length(p) > 30 then 'O nome curto deve ter de 3 a 30 caracteres.'
    when p !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then 'Use só letras minúsculas sem acento, números e hífen (o hífen não pode ficar no início nem no fim).'
    when p like '%--%' then 'Não use dois hífens seguidos.'
    when p = any (array['app','www','mail','email','smtp','imap','pop','ftp','api','admin','administrador',
      'atendimento','portal','suporte','ajuda','help','vluma','atos','clarezza','dev','teste','test','staging',
      'homolog','prd','prod','status','blog','docs','cdn','static','assets','ns1','ns2','webmail','autodiscover',
      'login','auth','painel','dashboard','conta','contas','billing','pagamento','cobranca','root','sistema'])
      then 'Este nome é reservado. Escolha outro.'
    else null end
$$;

create table if not exists public.portal_slugs_antigos (
  slug text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  valido_ate timestamptz not null
);
alter table public.portal_slugs_antigos enable row level security;

-- ---------- plataforma ----------
create table if not exists public.portal_plataforma (
  id boolean primary key default true check (id),
  dominio_base text,                       -- ex.: vluma.com.br (vazio = só o endereço interno /portal/<nome>)
  prefixo text not null default 'atendimento',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
insert into public.portal_plataforma (id) values (true) on conflict do nothing;
alter table public.portal_plataforma enable row level security;

-- ---------- endereços do portal ----------
create table if not exists public.portal_enderecos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  host text not null check (host = lower(host)),
  tipo text not null check (tipo in ('subdominio', 'dominio_proprio')),
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'aguardando_dns', 'verificando', 'ativo', 'erro', 'removido')),
  principal boolean not null default false,
  detalhe jsonb not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists portal_enderecos_host_uk on public.portal_enderecos (host) where situacao <> 'removido';
alter table public.portal_enderecos enable row level security;
drop policy if exists portal_enderecos_select on public.portal_enderecos;
create policy portal_enderecos_select on public.portal_enderecos for select
  using (get_meu_role() = 'super_admin' or (tenant_id = get_meu_tenant() and get_meu_role() in ('admin', 'gestor')));

-- ---------- pessoas e vínculos ----------
create table if not exists public.portal_pessoas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 120),
  email text not null,
  celular text,
  criado_em timestamptz not null default now()
);
alter table public.portal_pessoas enable row level security;

create table if not exists public.portal_vinculos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.portal_pessoas(user_id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  perfil text not null check (perfil in ('supervisor', 'usuario')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  desativado_em timestamptz,
  desativado_por uuid,
  unique (user_id, client_id)
);
create index if not exists portal_vinculos_tenant_idx on public.portal_vinculos (tenant_id, client_id);
alter table public.portal_vinculos enable row level security;

-- o cliente tem que ser da mesma empresa do vínculo
create or replace function public.fn_portal_vinculo_coerente()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.clients c where c.id = new.client_id and c.tenant_id = new.tenant_id) then
    raise exception 'O cliente não pertence a esta empresa.';
  end if;
  return new;
end $$;
drop trigger if exists trg_portal_vinculo_coerente on public.portal_vinculos;
create trigger trg_portal_vinculo_coerente before insert or update on public.portal_vinculos
  for each row execute function public.fn_portal_vinculo_coerente();

-- equipe interna da empresa enxerga as pessoas/vínculos dos próprios clientes
drop policy if exists portal_vinculos_select on public.portal_vinculos;
create policy portal_vinculos_select on public.portal_vinculos for select
  using (get_meu_role() = 'super_admin' or (tenant_id = get_meu_tenant() and get_meu_role() in ('admin', 'gestor')));
drop policy if exists portal_pessoas_select on public.portal_pessoas;
create policy portal_pessoas_select on public.portal_pessoas for select
  using (get_meu_role() = 'super_admin' or exists (
    select 1 from public.portal_vinculos v
    where v.user_id = portal_pessoas.user_id and v.tenant_id = get_meu_tenant() and get_meu_role() in ('admin', 'gestor')));

-- ---------- termos ----------
create table if not exists public.termos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,   -- nulo = padrão VLUMA
  tipo text not null check (tipo in ('uso', 'privacidade', 'comunicacao')),
  versao int not null check (versao >= 1),
  titulo text not null check (length(trim(titulo)) between 3 and 120),
  texto text not null check (length(trim(texto)) >= 20),
  publicado_em timestamptz not null default now(),
  publicado_por uuid
);
create unique index if not exists termos_versao_uk on public.termos
  (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo, versao);
alter table public.termos enable row level security;
drop policy if exists termos_select on public.termos;
create policy termos_select on public.termos for select
  using (get_meu_role() = 'super_admin'
         or (get_meu_role() in ('admin', 'gestor') and (tenant_id is null or tenant_id = get_meu_tenant())));

create table if not exists public.termos_aceites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  termo_id uuid not null references public.termos(id),
  aceito_em timestamptz not null default now(),
  canal text not null default 'portal' check (canal in ('portal', 'whatsapp', 'email')),
  ip text,
  user_agent text,
  revogado_em timestamptz
);
create index if not exists termos_aceites_user_idx on public.termos_aceites (user_id, tenant_id);
alter table public.termos_aceites enable row level security;
drop policy if exists termos_aceites_select on public.termos_aceites;
create policy termos_aceites_select on public.termos_aceites for select
  using (get_meu_role() = 'super_admin' or (tenant_id = get_meu_tenant() and get_meu_role() = 'admin'));

-- ---------- auditoria ----------
create table if not exists public.portal_auditoria (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid,
  acao text not null,
  detalhe jsonb not null default '{}',
  em timestamptz not null default now()
);
create index if not exists portal_auditoria_tenant_idx on public.portal_auditoria (tenant_id, em desc);
alter table public.portal_auditoria enable row level security;
drop policy if exists portal_auditoria_select on public.portal_auditoria;
create policy portal_auditoria_select on public.portal_auditoria for select
  using (get_meu_role() = 'super_admin' or (tenant_id = get_meu_tenant() and get_meu_role() = 'admin'));

create or replace function public.fn_portal_auditar(p_tenant uuid, p_acao text, p_detalhe jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.portal_auditoria (tenant_id, user_id, acao, detalhe) values (p_tenant, auth.uid(), p_acao, coalesce(p_detalhe, '{}'));
$$;
revoke execute on function public.fn_portal_auditar(uuid, text, jsonb) from public, anon, authenticated;

-- ---------- funções de apoio ----------
-- termos vigentes de uma empresa: o texto próprio (se a empresa escolheu e
-- publicou) ou o padrão VLUMA; sempre a última versão
create or replace function public.portal_termos_vigentes(p_tenant uuid)
returns table (id uuid, tipo text, versao int, titulo text, texto text, proprio boolean)
language sql stable security definer set search_path = public as $$
  select distinct on (t.tipo) t.id, t.tipo, t.versao, t.titulo, t.texto, (t.tenant_id is not null)
  from public.termos t
  join public.tenants e on e.id = p_tenant
  where (t.tenant_id = p_tenant and t.tipo = any (e.portal_termos_proprios))
     or (t.tenant_id is null and not (t.tipo = any (e.portal_termos_proprios)
                                      and exists (select 1 from public.termos o where o.tenant_id = p_tenant and o.tipo = t.tipo)))
  order by t.tipo, t.versao desc
$$;
revoke execute on function public.portal_termos_vigentes(uuid) from public, anon, authenticated;

-- pessoa logada tem vínculo ativo nesta empresa?
create or replace function public.portal_tem_vinculo(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.portal_vinculos v where v.user_id = auth.uid() and v.tenant_id = p_tenant and v.ativo)
$$;
revoke execute on function public.portal_tem_vinculo(uuid) from public, anon, authenticated;

-- ---------- portal: chamadas públicas e do usuário do portal ----------
-- Descobre o portal pelo nome curto (endereço interno /portal/<nome>) ou
-- pelo host (subdomínio VLUMA / domínio próprio). Devolve só a identidade
-- pública. Prévia: admin/gestor da própria empresa vê mesmo desligado.
create or replace function public.portal_resolver(p_slug text default null, p_host text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_t public.tenants; v_slug text := lower(trim(p_slug)); v_host text := lower(trim(p_host));
  v_plat public.portal_plataforma; v_novo text; v_previa boolean := false;
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
  return jsonb_build_object(
    'disponivel', true, 'previa', v_previa,
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

-- Texto de um termo vigente (transparência: o aviso de privacidade pode ser
-- lido antes do login)
create or replace function public.portal_termo_texto(p_slug text, p_tipo text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t public.tenants; r record;
begin
  select * into v_t from public.tenants where portal_slug = lower(trim(p_slug));
  if v_t.id is null or not ((v_t.portal_habilitado and v_t.portal_ativo)
     or (v_t.id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'))) then return null; end if;
  select * into r from public.portal_termos_vigentes(v_t.id) x where x.tipo = p_tipo;
  if r.id is null then return null; end if;
  return jsonb_build_object('id', r.id, 'tipo', r.tipo, 'versao', r.versao, 'titulo', r.titulo,
    'texto', replace(r.texto, '{{empresa}}', coalesce(nullif(trim(v_t.trade_name), ''), v_t.name)));
end $$;
revoke execute on function public.portal_termo_texto(text, text) from public;
grant execute on function public.portal_termo_texto(text, text) to anon, authenticated;

-- Contexto da pessoa logada neste portal: quem é, de quais clientes, e os
-- termos que ainda precisa aceitar
create or replace function public.portal_meu_contexto(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p public.portal_pessoas; v_empresa text;
begin
  if auth.uid() is null then return jsonb_build_object('logado', false); end if;
  select * into v_p from public.portal_pessoas where user_id = auth.uid();
  if v_p.user_id is null or not public.portal_tem_vinculo(p_tenant) then
    return jsonb_build_object('logado', true, 'acesso', false,
      'interno', exists (select 1 from public.users where id = auth.uid()));
  end if;
  select coalesce(nullif(trim(trade_name), ''), name) into v_empresa from public.tenants where id = p_tenant;
  return jsonb_build_object('logado', true, 'acesso', true,
    'pessoa', jsonb_build_object('nome', v_p.nome, 'email', v_p.email),
    'vinculos', coalesce((select jsonb_agg(jsonb_build_object('client_id', c.id, 'cliente', c.name, 'perfil', v.perfil) order by c.name)
                          from public.portal_vinculos v join public.clients c on c.id = v.client_id
                          where v.user_id = auth.uid() and v.tenant_id = p_tenant and v.ativo), '[]'),
    'termos_pendentes', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'versao', x.versao, 'titulo', x.titulo,
                                    'texto', replace(x.texto, '{{empresa}}', v_empresa)) order by x.tipo)
                          from public.portal_termos_vigentes(p_tenant) x
                          where not exists (select 1 from public.termos_aceites a
                                            where a.user_id = auth.uid() and a.tenant_id = p_tenant
                                              and a.termo_id = x.id and a.revogado_em is null)), '[]'));
end $$;
revoke execute on function public.portal_meu_contexto(uuid) from public, anon;
grant execute on function public.portal_meu_contexto(uuid) to authenticated;

-- Aceite dos termos (registra versão, data, canal, IP e navegador)
create or replace function public.portal_aceitar_termos(p_tenant uuid, p_termos uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_h jsonb; v_ip text; v_ua text; v_n int := 0; v_id uuid;
begin
  if auth.uid() is null or not public.portal_tem_vinculo(p_tenant) then
    raise exception 'Sem acesso a este portal.';
  end if;
  begin v_h := current_setting('request.headers', true)::jsonb; exception when others then v_h := null; end;
  v_ip := split_part(coalesce(v_h->>'cf-connecting-ip', v_h->>'x-forwarded-for', v_h->>'x-real-ip', ''), ',', 1);
  v_ua := left(v_h->>'user-agent', 300);
  foreach v_id in array coalesce(p_termos, '{}') loop
    if not exists (select 1 from public.portal_termos_vigentes(p_tenant) x where x.id = v_id) then
      raise exception 'Termo desatualizado. Recarregue a página.';
    end if;
    if not exists (select 1 from public.termos_aceites where user_id = auth.uid() and tenant_id = p_tenant
                     and termo_id = v_id and revogado_em is null) then
      insert into public.termos_aceites (user_id, tenant_id, termo_id, canal, ip, user_agent)
      values (auth.uid(), p_tenant, v_id, 'portal', nullif(v_ip, ''), v_ua);
      v_n := v_n + 1;
    end if;
  end loop;
  perform public.fn_portal_auditar(p_tenant, 'termos_aceitos', jsonb_build_object('termos', p_termos));
  return v_n;
end $$;
revoke execute on function public.portal_aceitar_termos(uuid, uuid[]) from public, anon;
grant execute on function public.portal_aceitar_termos(uuid, uuid[]) to authenticated;

create or replace function public.portal_registrar_acesso(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.portal_tem_vinculo(p_tenant) then return; end if;
  perform public.fn_portal_auditar(p_tenant, 'acesso', '{}');
end $$;
revoke execute on function public.portal_registrar_acesso(uuid) from public, anon;
grant execute on function public.portal_registrar_acesso(uuid) to authenticated;

-- ---------- configuração: empresa (admin) ----------
create or replace function public.portal_slug_disponivel(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_slug text := lower(trim(p_slug)); v_erro text;
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then raise exception 'Sem permissão.'; end if;
  v_erro := public.portal_slug_erro(v_slug);
  if v_erro is null and exists (select 1 from public.tenants where portal_slug = v_slug and id is distinct from public.get_meu_tenant()) then
    v_erro := 'Este nome já está em uso por outra empresa.';
  end if;
  if v_erro is null and exists (select 1 from public.portal_slugs_antigos where slug = v_slug and valido_ate > now()
                                  and tenant_id is distinct from public.get_meu_tenant()) then
    v_erro := 'Este nome foi usado recentemente por outra empresa e ainda está reservado.';
  end if;
  return jsonb_build_object('ok', v_erro is null, 'erro', v_erro);
end $$;
revoke execute on function public.portal_slug_disponivel(text) from public, anon;
grant execute on function public.portal_slug_disponivel(text) to authenticated;

-- p: {slug, nome, cor, boas_vindas, contatos{email,telefone,whatsapp,site}, termos_proprios[], ativo}
create or replace function public.salvar_portal_config(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t public.tenants; v_slug text := nullif(lower(trim(p->>'slug')), ''); v_disp jsonb;
  v_ativo boolean := coalesce((p->>'ativo')::boolean, false);
  v_proprios text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'termos_proprios', '[]')) x
                                 where x in ('uso', 'privacidade', 'comunicacao')), '{}');
  v_contatos jsonb := jsonb_strip_nulls(jsonb_build_object(
    'email', nullif(trim(p->'contatos'->>'email'), ''), 'telefone', nullif(trim(p->'contatos'->>'telefone'), ''),
    'whatsapp', nullif(regexp_replace(coalesce(p->'contatos'->>'whatsapp', ''), '\D', '', 'g'), ''),
    'site', nullif(trim(p->'contatos'->>'site'), '')));
begin
  if public.get_meu_role() <> 'admin' then raise exception 'Só o administrador da empresa configura o portal.'; end if;
  select * into v_t from public.tenants where id = public.get_meu_tenant() for update;
  if not v_t.portal_habilitado then raise exception 'O portal ainda não foi habilitado pela VLUMA para a sua empresa.'; end if;
  if v_slug is not null then
    v_disp := public.portal_slug_disponivel(v_slug);
    if not (v_disp->>'ok')::boolean then raise exception '%', v_disp->>'erro'; end if;
  end if;
  if v_ativo and (v_slug is null) then raise exception 'Defina o nome curto antes de ativar o portal.'; end if;
  if (p->>'cor') is not null and (p->>'cor') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Cor inválida.'; end if;
  if v_contatos ? 'whatsapp' and length(v_contatos->>'whatsapp') not between 10 and 13 then
    raise exception 'WhatsApp inválido: informe DDD e número.';
  end if;
  -- termo próprio só vale se já houver texto publicado
  if exists (select 1 from unnest(v_proprios) x where not exists (select 1 from public.termos t where t.tenant_id = v_t.id and t.tipo = x)) then
    raise exception 'Publique o texto próprio antes de escolher usá-lo.';
  end if;
  -- nome curto trocado: o antigo redireciona por 90 dias
  if v_t.portal_slug is not null and v_t.portal_slug is distinct from v_slug then
    insert into public.portal_slugs_antigos (slug, tenant_id, valido_ate) values (v_t.portal_slug, v_t.id, now() + interval '90 days')
    on conflict (slug) do update set tenant_id = excluded.tenant_id, valido_ate = excluded.valido_ate;
  end if;
  delete from public.portal_slugs_antigos where slug = v_slug;
  update public.tenants set
    portal_slug = v_slug,
    portal_nome = nullif(trim(p->>'nome'), ''),
    portal_cor = nullif(p->>'cor', ''),
    portal_boas_vindas = nullif(trim(p->>'boas_vindas'), ''),
    portal_contatos = v_contatos,
    portal_termos_proprios = v_proprios,
    portal_ativo = v_ativo
  where id = v_t.id;
  perform public.fn_portal_auditar(v_t.id, 'config_salva', jsonb_build_object('slug', v_slug, 'ativo', v_ativo,
    'slug_anterior', case when v_t.portal_slug is distinct from v_slug then v_t.portal_slug end));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.salvar_portal_config(jsonb) from public, anon;
grant execute on function public.salvar_portal_config(jsonb) to authenticated;

-- logo pública do portal foi atualizada (cache do navegador)
create or replace function public.portal_logo_atualizada()
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.get_meu_role() <> 'admin' then raise exception 'Sem permissão.'; end if;
  update public.tenants set portal_logo_versao = (extract(epoch from now()) * 1000)::bigint where id = public.get_meu_tenant();
end $$;
revoke execute on function public.portal_logo_atualizada() from public, anon;
grant execute on function public.portal_logo_atualizada() to authenticated;

-- publica nova versão de um termo: padrão VLUMA (Super Admin) ou próprio da empresa (admin)
create or replace function public.publicar_termo(p_tipo text, p_titulo text, p_texto text, p_padrao boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_versao int; v_id uuid;
begin
  if p_padrao then
    if public.get_meu_role() <> 'super_admin' then raise exception 'Só o Super Admin publica os termos padrão.'; end if;
    v_tenant := null;
  else
    if public.get_meu_role() <> 'admin' then raise exception 'Só o administrador da empresa publica termos próprios.'; end if;
    v_tenant := public.get_meu_tenant();
  end if;
  if p_tipo not in ('uso', 'privacidade', 'comunicacao') then raise exception 'Tipo de termo inválido.'; end if;
  select coalesce(max(versao), 0) + 1 into v_versao from public.termos
   where tenant_id is not distinct from v_tenant and tipo = p_tipo;
  insert into public.termos (tenant_id, tipo, versao, titulo, texto, publicado_por)
  values (v_tenant, p_tipo, v_versao, trim(p_titulo), trim(p_texto), auth.uid()) returning id into v_id;
  perform public.fn_portal_auditar(v_tenant, 'termo_publicado', jsonb_build_object('tipo', p_tipo, 'versao', v_versao, 'padrao', p_padrao));
  return jsonb_build_object('id', v_id, 'versao', v_versao);
end $$;
revoke execute on function public.publicar_termo(text, text, text, boolean) from public, anon;
grant execute on function public.publicar_termo(text, text, text, boolean) to authenticated;

-- ---------- configuração: plataforma (Super Admin) ----------
create or replace function public.definir_portal_habilitado(p_tenant uuid, p_habilitado boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.get_meu_role() <> 'super_admin' then raise exception 'Só o Super Admin habilita o portal.'; end if;
  update public.tenants set portal_habilitado = p_habilitado where id = p_tenant;
  perform public.fn_portal_auditar(p_tenant, case when p_habilitado then 'portal_habilitado' else 'portal_desabilitado' end, '{}');
end $$;
revoke execute on function public.definir_portal_habilitado(uuid, boolean) from public, anon;
grant execute on function public.definir_portal_habilitado(uuid, boolean) to authenticated;

create or replace function public.portal_config_plataforma()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.get_meu_role() in ('super_admin', 'admin', 'gestor')
    then (select jsonb_build_object('dominio_base', dominio_base, 'prefixo', prefixo) from public.portal_plataforma limit 1) end
$$;
revoke execute on function public.portal_config_plataforma() from public, anon;
grant execute on function public.portal_config_plataforma() to authenticated;

create or replace function public.definir_portal_plataforma(p_dominio_base text, p_prefixo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.get_meu_role() <> 'super_admin' then raise exception 'Sem permissão.'; end if;
  if p_dominio_base is not null and p_dominio_base !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
    raise exception 'Domínio inválido.';
  end if;
  if coalesce(p_prefixo, '') !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then raise exception 'Prefixo inválido.'; end if;
  update public.portal_plataforma set dominio_base = nullif(lower(trim(p_dominio_base)), ''), prefixo = lower(trim(p_prefixo)),
    atualizado_em = now(), atualizado_por = auth.uid();
end $$;
revoke execute on function public.definir_portal_plataforma(text, text) from public, anon;
grant execute on function public.definir_portal_plataforma(text, text) to authenticated;

-- ---------- storage: logo pública do portal ----------
insert into storage.buckets (id, name, public) values ('portal-publico', 'portal-publico', true)
on conflict (id) do update set public = true;
drop policy if exists portal_publico_escrita on storage.objects;
create policy portal_publico_escrita on storage.objects for all to authenticated
  using (bucket_id = 'portal-publico' and (storage.foldername(name))[1] = public.get_meu_tenant()::text and public.get_meu_role() = 'admin')
  with check (bucket_id = 'portal-publico' and (storage.foldername(name))[1] = public.get_meu_tenant()::text and public.get_meu_role() = 'admin');

-- ---------- termos padrão VLUMA (versão 1) ----------
-- Modelo baseado na LGPD (Lei 13.709/2018). Recomendação registrada:
-- revisão jurídica antes da venda. {{empresa}} = nome da empresa do portal.
insert into public.termos (tenant_id, tipo, versao, titulo, texto)
select null, 'uso', 1, 'Termos de uso do portal', $t$Este portal é oferecido pela {{empresa}} para que você abra e acompanhe chamados de atendimento. A tecnologia é fornecida pela VLUMA (plataforma ATOS).

1. Acesso. O acesso é pessoal e foi liberado pela {{empresa}} ou pelo responsável da sua empresa. Não compartilhe sua senha. Avise a {{empresa}} se suspeitar de uso indevido.

2. Uso adequado. Use o portal apenas para assuntos de atendimento. Não envie conteúdo ilícito, ofensivo, nem dados de terceiros sem necessidade.

3. Chamados. As informações, fotos e arquivos que você enviar serão usados para atender o chamado e ficarão no histórico do atendimento.

4. Prazos. Prazos e previsões exibidos seguem o contrato entre a sua empresa e a {{empresa}}.

5. Disponibilidade. O portal pode passar por manutenções. Em caso de urgência, use os contatos da {{empresa}} exibidos no portal.

6. Alterações. Estes termos podem ser atualizados. Quando isso acontecer, pediremos um novo aceite.$t$
where not exists (select 1 from public.termos where tenant_id is null and tipo = 'uso');

insert into public.termos (tenant_id, tipo, versao, titulo, texto)
select null, 'privacidade', 1, 'Aviso de privacidade', $t$Este aviso explica como seus dados pessoais são tratados no portal de atendimento da {{empresa}}, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).

Quem é responsável. A {{empresa}} é a controladora dos seus dados. A VLUMA, fornecedora da plataforma ATOS, é a operadora: trata os dados apenas para prestar o serviço à {{empresa}}.

Quais dados. Nome, e-mail, celular, empresa e unidade a que você está vinculado, os chamados que você abre e acompanha (textos, fotos e arquivos), registros de acesso (data, hora, endereço IP e navegador) e os seus aceites.

Para quê. Identificar você, registrar e atender chamados, informar o andamento, cumprir o contrato com a sua empresa, garantir a segurança do acesso e cumprir obrigações legais.

Com quem compartilhamos. Com a equipe da {{empresa}} envolvida no atendimento e com fornecedores de tecnologia necessários ao funcionamento (hospedagem e envio de mensagens), sempre sob confidencialidade.

Por quanto tempo. Enquanto durar a relação de atendimento e pelo prazo necessário para cumprir obrigações legais e contratuais.

Seus direitos. Você pode pedir confirmação, acesso, correção, anonimização, portabilidade e informação sobre compartilhamento, e retirar consentimentos. Fale com a {{empresa}} pelos contatos do portal.$t$
where not exists (select 1 from public.termos where tenant_id is null and tipo = 'privacidade');

insert into public.termos (tenant_id, tipo, versao, titulo, texto)
select null, 'comunicacao', 1, 'Consentimento de comunicação', $t$Autorizo a {{empresa}} a me enviar mensagens sobre os meus chamados de atendimento (abertura, andamento, agendamentos, pedidos de informação e conclusão) pelos canais que a {{empresa}} disponibilizar e que eu escolher, como e-mail e WhatsApp.

As mensagens são apenas de serviço, sem propaganda. Posso retirar este consentimento a qualquer momento nas preferências do portal, respondendo SAIR no WhatsApp ou pelo link no e-mail. Sem ele, continuo acompanhando meus chamados pelo portal.$t$
where not exists (select 1 from public.termos where tenant_id is null and tipo = 'comunicacao');
