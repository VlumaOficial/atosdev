-- ============================================================
-- ATOS — Migration 034 (F6 Blocos D + E): envio do relatório
-- ============================================================
-- Decisões do usuário (2026-09-24): três opções liberadas por nível
-- (plano) — Básico (WhatsApp pelo aparelho + e-mail "via ATOS"),
-- Intermediário (+ e-mail próprio da empresa, SMTP porta 465),
-- Avançado (+ WhatsApp automático — Evolution/oficial, a refinar).
-- Até a F8 existir, o Super Admin define o nível de cada empresa.
-- A empresa configura: canais ligados, mensagem padrão, quem pode
-- enviar (Bloco E) e o e-mail próprio (senha no Vault, nunca na tabela).
-- ============================================================

alter table public.tenants add column if not exists envio_nivel text not null default 'basico'
  check (envio_nivel in ('basico', 'intermediario', 'avancado'));

create table if not exists public.tenant_envio_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  whatsapp_ativo boolean not null default true,
  email_ativo boolean not null default true,
  mensagem text not null default 'Olá! Segue o relatório do atendimento {os} realizado pela {empresa} para {cliente}. Você pode abrir o documento e conferir a autenticidade em: {link}',
  permissao text not null default 'todos' check (permissao in ('todos', 'selecionados', 'ninguem')),
  tecnicos_permitidos uuid[] not null default '{}',
  -- e-mail próprio (nível Intermediário+); senha fica no Vault
  smtp_ativo boolean not null default false,
  smtp_host text,
  smtp_porta integer not null default 465,
  smtp_usuario text,
  smtp_remetente_nome text,
  smtp_email_remetente text,
  atualizado_em timestamptz not null default now()
);
alter table public.tenant_envio_config enable row level security;
-- todos da empresa leem (o técnico precisa saber quais botões mostrar)
drop policy if exists tenant_envio_config_select on public.tenant_envio_config;
create policy tenant_envio_config_select on public.tenant_envio_config
  for select using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
insert into public.tenant_envio_config (tenant_id) select id from public.tenants on conflict do nothing;

-- empresa nova já nasce com a configuração padrão
create or replace function public.fn_tenant_envio_config_padrao()
returns trigger as $$
begin
  insert into public.tenant_envio_config (tenant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;
drop trigger if exists trg_tenant_envio_config_padrao on public.tenants;
create trigger trg_tenant_envio_config_padrao after insert on public.tenants
  for each row execute function public.fn_tenant_envio_config_padrao();

create or replace function public.salvar_config_envio(
  p_whatsapp boolean, p_email boolean, p_mensagem text, p_permissao text, p_tecnicos uuid[],
  p_smtp_ativo boolean, p_smtp_host text, p_smtp_porta integer, p_smtp_usuario text,
  p_smtp_remetente_nome text, p_smtp_email_remetente text
) returns void as $$
declare v_nivel text;
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then raise exception 'Sem permissão'; end if;
  if nullif(trim(coalesce(p_mensagem, '')), '') is null then raise exception 'A mensagem padrão não pode ficar vazia'; end if;
  if position('{link}' in p_mensagem) = 0 then raise exception 'A mensagem precisa ter {link} (o link do relatório)'; end if;
  select envio_nivel into v_nivel from public.tenants where id = public.get_meu_tenant();
  if coalesce(p_smtp_ativo, false) and v_nivel = 'basico' then
    raise exception 'E-mail próprio disponível a partir do nível Intermediário';
  end if;
  if coalesce(p_smtp_ativo, false) and coalesce(p_smtp_porta, 465) <> 465 then
    raise exception 'Use a porta 465 (SSL) — a plataforma não permite outras portas de e-mail';
  end if;
  update public.tenant_envio_config set
    whatsapp_ativo = coalesce(p_whatsapp, true), email_ativo = coalesce(p_email, true),
    mensagem = trim(p_mensagem), permissao = coalesce(p_permissao, 'todos'),
    tecnicos_permitidos = coalesce(p_tecnicos, '{}'),
    smtp_ativo = coalesce(p_smtp_ativo, false), smtp_host = nullif(trim(coalesce(p_smtp_host, '')), ''),
    smtp_porta = coalesce(p_smtp_porta, 465), smtp_usuario = nullif(trim(coalesce(p_smtp_usuario, '')), ''),
    smtp_remetente_nome = nullif(trim(coalesce(p_smtp_remetente_nome, '')), ''),
    smtp_email_remetente = nullif(trim(coalesce(p_smtp_email_remetente, '')), ''),
    atualizado_em = now()
  where tenant_id = public.get_meu_tenant();
end;
$$ language plpgsql security definer;

-- senha do e-mail próprio → Vault (nunca volta ao navegador)
create or replace function public.definir_senha_smtp(p_senha text)
returns void as $$
declare v_nome text := 'smtp_tenant_' || public.get_meu_tenant()::text; v_id uuid;
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then raise exception 'Sem permissão'; end if;
  if nullif(p_senha, '') is null then raise exception 'Informe a senha'; end if;
  select id into v_id from vault.secrets where name = v_nome;
  if v_id is null then perform vault.create_secret(p_senha, v_nome, 'Senha SMTP do e-mail próprio da empresa');
  else perform vault.update_secret(v_id, p_senha); end if;
end;
$$ language plpgsql security definer;

create or replace function public.tem_senha_smtp()
returns boolean as $$
  select exists (select 1 from vault.secrets where name = 'smtp_tenant_' || public.get_meu_tenant()::text);
$$ language sql security definer stable;

-- Super Admin: nível de envio (até a F8 ligar isso ao plano)
create or replace function public.definir_nivel_envio(p_tenant uuid, p_nivel text)
returns void as $$
begin
  if public.get_meu_role() <> 'super_admin' then raise exception 'Apenas o Super Admin define o nível de envio'; end if;
  update public.tenants set envio_nivel = p_nivel where id = p_tenant;
  if p_nivel = 'basico' then update public.tenant_envio_config set smtp_ativo = false where tenant_id = p_tenant; end if;
end;
$$ language plpgsql security definer;

-- Leitura da senha do e-mail próprio: SÓ a service role (Edge Function)
create or replace function public.ler_senha_smtp(p_tenant uuid)
returns text as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'smtp_tenant_' || p_tenant::text limit 1;
$$ language sql security definer stable;
revoke execute on function public.ler_senha_smtp(uuid) from public, anon, authenticated;
