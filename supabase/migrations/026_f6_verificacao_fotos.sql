-- ============================================================
-- ATOS — Migration 026 (F6): código de verificação de autenticidade
-- ============================================================
-- Decisão de produto (2026-09-23, VISAO_ATOS.md F6): cada foto de
-- evidência ganha um código impresso no selo ATOS ("ATOS Verificado ·
-- código"), conferível por qualquer pessoa em /verificar/CÓDIGO.
--
-- O que o ATOS garante (limite honesto — app web não detecta GPS falso):
--  1. a foto não foi alterada depois do envio: sha256 do arquivo final
--     fica aqui; a verificação recalcula o hash do arquivo guardado
--  2. quem enviou e QUANDO o servidor recebeu (enviado_em = now() do
--     banco, não do celular) — relógio do aparelho adiantado/atrasado
--     aparece como divergência em relação a carimbado_em
--
-- Registros IMUTÁVEIS: sem policy de UPDATE/DELETE. Se a foto for
-- apagada (ex.: liberar espaço), o código continua existindo e a
-- verificação informa que o arquivo não está mais armazenado.
-- A leitura pública NÃO passa por RLS: é feita pela Edge Function
-- verificar-foto (service role), que devolve só o necessário.
-- ============================================================

create table if not exists public.fotos_verificacao (
  codigo text primary key check (codigo ~ '^[A-HJKMNP-Z2-9]{12}$'),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  file_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer,
  carimbado_em timestamptz,                -- hora do APARELHO (a impressa na foto)
  enviado_em timestamptz not null default now(),  -- hora do SERVIDOR
  enviado_por uuid references public.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  checklist_instance_id uuid references public.checklist_instances(id) on delete set null
);

create index if not exists fotos_verificacao_tenant_idx on public.fotos_verificacao (tenant_id);

-- servidor decide tenant, autor e hora — o cliente não consegue forjar
create or replace function public.fn_fotos_verificacao_insert()
returns trigger as $$
begin
  new.tenant_id := public.get_meu_tenant();
  new.enviado_por := auth.uid();
  new.enviado_em := now();
  if new.tenant_id is null or split_part(new.file_path, '/', 1) <> new.tenant_id::text then
    raise exception 'Arquivo fora da pasta da empresa';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_fotos_verificacao_insert on public.fotos_verificacao;
create trigger trg_fotos_verificacao_insert
  before insert on public.fotos_verificacao
  for each row execute function public.fn_fotos_verificacao_insert();

alter table public.fotos_verificacao enable row level security;

drop policy if exists fotos_verificacao_select on public.fotos_verificacao;
create policy fotos_verificacao_select on public.fotos_verificacao
  for select using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

drop policy if exists fotos_verificacao_insert on public.fotos_verificacao;
create policy fotos_verificacao_insert on public.fotos_verificacao
  for insert with check (tenant_id = public.get_meu_tenant());
-- sem UPDATE/DELETE de propósito (registro imutável)

grant select, insert on public.fotos_verificacao to authenticated;
