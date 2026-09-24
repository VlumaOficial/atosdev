-- ============================================================
-- ATOS — Migration 033 (F6): identidade legal da empresa só pela VLUMA
-- ============================================================
-- Decisão do usuário (2026-09-24, opção B): razão social e CNPJ são a
-- IDENTIDADE LEGAL de quem contratou o ATOS (saem no relatório PDF e,
-- na F8, na cobrança/nota) — o admin da empresa NÃO altera; quem altera
-- é o Super Admin (suporte VLUMA), com consulta à API pública da Receita
-- (BrasilAPI) para preencher/conferir, e histórico de toda alteração.
-- O admin continua editando nome de exibição e contato.
-- Corrige inconsistência da migration 031 (CNPJ estava editável pelo
-- admin, razão social não).
-- ============================================================

drop function if exists public.atualizar_dados_empresa(text, text, text, text, text);
create or replace function public.atualizar_dados_empresa(
  p_nome_exibicao text, p_telefone text, p_email text, p_site text
) returns void as $$
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then
    raise exception 'Sem permissão para alterar os dados da empresa';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is not null and trim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail de contato inválido';
  end if;
  update public.tenants set
    trade_name = nullif(trim(coalesce(p_nome_exibicao, '')), ''),
    phone = nullif(trim(coalesce(p_telefone, '')), ''),
    email = nullif(trim(coalesce(p_email, '')), ''),
    website = nullif(trim(coalesce(p_site, '')), ''),
    updated_at = now()
  where id = public.get_meu_tenant();
end;
$$ language plpgsql security definer;

create table if not exists public.tenant_identidade_historico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  alterado_por uuid references public.users(id) on delete set null,
  alterado_em timestamptz not null default now(),
  cnpj_anterior text, razao_anterior text,
  cnpj_novo text, razao_nova text,
  fonte text not null check (fonte in ('receita', 'manual'))  -- conferido na API pública ou digitado
);
alter table public.tenant_identidade_historico enable row level security;
drop policy if exists tenant_identidade_historico_select on public.tenant_identidade_historico;
create policy tenant_identidade_historico_select on public.tenant_identidade_historico
  for select using (public.get_meu_role() = 'super_admin');

create or replace function public.atualizar_identidade_tenant(p_tenant uuid, p_cnpj text, p_razao text, p_fonte text)
returns void as $$
declare
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_fmt text;
  v_ant record;
begin
  if public.get_meu_role() <> 'super_admin' then
    raise exception 'Apenas o suporte VLUMA (Super Admin) altera razão social e CNPJ';
  end if;
  if nullif(trim(coalesce(p_razao, '')), '') is null then raise exception 'Informe a razão social'; end if;
  if v_cnpj <> '' and not public.cnpj_valido(v_cnpj) then raise exception 'CNPJ inválido'; end if;
  v_fmt := case when v_cnpj = '' then null else
    substr(v_cnpj,1,2)||'.'||substr(v_cnpj,3,3)||'.'||substr(v_cnpj,6,3)||'/'||substr(v_cnpj,9,4)||'-'||substr(v_cnpj,13,2) end;
  select cnpj, name into v_ant from public.tenants where id = p_tenant;
  if not found then raise exception 'Empresa não encontrada'; end if;
  if v_ant.cnpj is not distinct from v_fmt and v_ant.name = trim(p_razao) then return; end if;

  update public.tenants set name = trim(p_razao), cnpj = v_fmt, updated_at = now() where id = p_tenant;
  insert into public.tenant_identidade_historico (tenant_id, alterado_por, cnpj_anterior, razao_anterior, cnpj_novo, razao_nova, fonte)
  values (p_tenant, auth.uid(), v_ant.cnpj, v_ant.name, v_fmt, trim(p_razao), case when p_fonte = 'receita' then 'receita' else 'manual' end);
end;
$$ language plpgsql security definer;
