-- ============================================================
-- ATOS — Migration 029 (F6): geocodificação como serviço da plataforma
-- ============================================================
-- Decisões do usuário (2026-09-24): mesmo provedor em DEV e PRD; troca
-- de provedor simplificada pelo Super Admin (sem deploy); dados de
-- consumo GERAL e POR EMPRESA desde já (base para a discussão de planos,
-- VISAO_ATOS.md 7.1).
--
-- A consulta sai do navegador e passa a ser feita pela Edge Function
-- "geocodificar" (chave do provedor nunca vai ao navegador). Três
-- tabelas SEM policy de leitura direta (só a service role da função as
-- lê); o acesso do app é por funções SECURITY DEFINER com checagem de
-- papel.
-- ============================================================

-- Configuração única da plataforma (1 linha)
create table if not exists public.geocodificacao_config (
  id boolean primary key default true check (id),
  provedor text not null default 'nominatim' check (provedor in ('nominatim', 'locationiq', 'opencage')),
  chave text,                                   -- chave da API (nunca exposta ao navegador)
  cache_horas integer not null default 48 check (cache_horas between 0 and 8760),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.users(id) on delete set null
);
insert into public.geocodificacao_config (id) values (true) on conflict do nothing;
alter table public.geocodificacao_config enable row level security;

-- Cache compartilhado: mesma região (~55 m) = uma consulta só.
-- Respeita o prazo do provedor (LocationIQ gratuito: 48 h).
create table if not exists public.geocodificacao_cache (
  chave text primary key,                       -- "lat,lng" arredondados
  endereco text,
  provedor text not null,
  criado_em timestamptz not null default now()
);
alter table public.geocodificacao_cache enable row level security;

-- Consumo por dia e por empresa
create table if not exists public.geocodificacao_uso (
  dia date not null default current_date,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provedor text not null,
  consultas integer not null default 0,         -- chamadas reais ao provedor
  cache integer not null default 0,             -- respondidas pelo cache (sem custo)
  falhas integer not null default 0,
  primary key (dia, tenant_id, provedor)
);
alter table public.geocodificacao_uso enable row level security;

-- Registro de uso (chamado pela Edge Function com a service role)
create or replace function public.registrar_uso_geocodificacao(p_tenant uuid, p_provedor text, p_tipo text)
returns void as $$
begin
  insert into public.geocodificacao_uso (dia, tenant_id, provedor, consultas, cache, falhas)
  values (current_date, p_tenant, p_provedor,
          (p_tipo = 'consulta')::int, (p_tipo = 'cache')::int, (p_tipo = 'falha')::int)
  on conflict (dia, tenant_id, provedor) do update set
    consultas = geocodificacao_uso.consultas + excluded.consultas,
    cache = geocodificacao_uso.cache + excluded.cache,
    falhas = geocodificacao_uso.falhas + excluded.falhas;
end;
$$ language plpgsql security definer;
revoke execute on function public.registrar_uso_geocodificacao(uuid, text, text) from public, anon, authenticated;

-- Super Admin: troca de provedor (chave null = mantém a atual)
create or replace function public.definir_config_geocodificacao(
  p_provedor text, p_chave text default null, p_cache_horas integer default null
) returns void as $$
begin
  if public.get_meu_role() <> 'super_admin' then
    raise exception 'Apenas o Super Admin pode alterar o provedor de endereços';
  end if;
  if p_provedor in ('locationiq', 'opencage')
     and coalesce(nullif(trim(p_chave), ''), (select chave from public.geocodificacao_config where provedor = p_provedor)) is null then
    raise exception 'Informe a chave da API do provedor';
  end if;
  update public.geocodificacao_config set
    provedor = p_provedor,
    chave = case when nullif(trim(coalesce(p_chave, '')), '') is not null then trim(p_chave)
                 when p_provedor = 'nominatim' then null else chave end,
    cache_horas = coalesce(p_cache_horas, cache_horas),
    atualizado_em = now(),
    atualizado_por = auth.uid()
  where id;
end;
$$ language plpgsql security definer;

-- Super Admin: situação atual (chave mascarada)
create or replace function public.status_geocodificacao()
returns table (provedor text, chave_mascarada text, cache_horas integer, atualizado_em timestamptz) as $$
begin
  if public.get_meu_role() <> 'super_admin' then
    raise exception 'Sem permissão';
  end if;
  return query
  select c.provedor,
         case when c.chave is null then null else repeat('•', 8) || right(c.chave, 4) end,
         c.cache_horas, c.atualizado_em
    from public.geocodificacao_config c where c.id;
end;
$$ language plpgsql security definer stable;

-- Nome do provedor ativo (sem chave) — para a atribuição exigida pelo
-- provedor no rodapé/aviso de privacidade. Qualquer usuário logado.
create or replace function public.provedor_geocodificacao()
returns text as $$
  select provedor from public.geocodificacao_config where id;
$$ language sql security definer stable;

-- Consumo no período: super admin vê todas as empresas; admin, a própria
create or replace function public.uso_geocodificacao(p_de date, p_ate date)
returns table (tenant_id uuid, tenant_nome text, provedor text, consultas bigint, cache bigint, falhas bigint) as $$
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then
    raise exception 'Sem permissão';
  end if;
  return query
  select u.tenant_id, t.name, u.provedor, sum(u.consultas)::bigint, sum(u.cache)::bigint, sum(u.falhas)::bigint
    from public.geocodificacao_uso u
    join public.tenants t on t.id = u.tenant_id
   where u.dia between p_de and p_ate
     and (public.get_meu_role() = 'super_admin' or u.tenant_id = public.get_meu_tenant())
   group by u.tenant_id, t.name, u.provedor;
end;
$$ language plpgsql security definer stable;
