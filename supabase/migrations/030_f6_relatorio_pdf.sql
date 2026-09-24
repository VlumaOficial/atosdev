-- ============================================================
-- ATOS — Migration 030 (F6 Bloco C): relatório PDF da OS
-- ============================================================
-- Decisões (2026-09-24): PDF gerado AUTOMATICAMENTE no SERVIDOR quando
-- a OS é concluída, GUARDADO como relatório oficial (o que o cliente
-- recebe = o que fica arquivado), com código de verificação + QR como as
-- fotos. OS reaberta e concluída de novo = nova versão (anteriores
-- ficam). Layout aprovado pelo usuário.
--
-- Disparo pelo BANCO: ao virar "concluida", o gatilho cria o registro
-- "pendente" e chama a Edge Function gerar-relatorio-os via pg_net —
-- não depende do celular do técnico. A chave usada na chamada fica no
-- Vault (segredo "atos_service_role_key", criado FORA deste arquivo —
-- nunca versionar a chave). Sem o segredo, o registro fica "pendente" e
-- o app gera sob demanda (rede de segurança).
-- ============================================================

create extension if not exists pg_net with schema extensions;

-- PDFs com muitas fotos passam de 5 MB (fotos seguem limitadas a 5 MB no app)
update storage.buckets set file_size_limit = 25 * 1024 * 1024 where id = 'evidencias';

create table if not exists public.order_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  versao integer not null,
  status text not null default 'pendente' check (status in ('pendente', 'gerando', 'gerado', 'falha')),
  file_path text unique,
  sha256 text,
  bytes integer,
  codigo text,
  erro text,
  tentativas integer not null default 0,
  criado_em timestamptz not null default now(),
  gerado_em timestamptz,
  unique (order_id, versao)
);
create index if not exists order_reports_order_idx on public.order_reports (order_id, versao desc);
alter table public.order_reports enable row level security;
drop policy if exists order_reports_select on public.order_reports;
create policy order_reports_select on public.order_reports
  for select using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
-- escrita só pela service role (Edge Function) — sem policy de insert/update/delete

-- Verificação passa a valer para fotos E relatórios
alter table public.fotos_verificacao add column if not exists tipo text not null default 'foto' check (tipo in ('foto', 'relatorio'));

create or replace function public.fn_fotos_verificacao_insert()
returns trigger as $$
begin
  new.enviado_em := now();
  if auth.uid() is not null then
    -- usuário do app: servidor decide empresa e autor (não dá pra forjar)
    new.tenant_id := public.get_meu_tenant();
    new.enviado_por := auth.uid();
  end if;
  -- service role (Edge Function do relatório): usa a empresa informada,
  -- mas o arquivo precisa estar na pasta dela
  if new.tenant_id is null or split_part(new.file_path, '/', 1) <> new.tenant_id::text then
    raise exception 'Arquivo fora da pasta da empresa';
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Gatilho: OS concluída → relatório pendente + chamada à Edge Function
create or replace function public.fn_orders_relatorio_ao_concluir()
returns trigger as $$
declare
  v_versao integer;
  v_chave text;
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    select coalesce(max(versao), 0) + 1 into v_versao from public.order_reports where order_id = new.id;
    insert into public.order_reports (tenant_id, order_id, versao) values (new.tenant_id, new.id, v_versao);

    select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'atos_service_role_key' limit 1;
    if v_chave is not null then
      perform net.http_post(
        url := 'https://vgkiddqahubznlzkxfgb.supabase.co/functions/v1/gerar-relatorio-os',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chave),
        body := jsonb_build_object('order_id', new.id),
        timeout_milliseconds := 60000
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_orders_relatorio_ao_concluir on public.orders;
create trigger trg_orders_relatorio_ao_concluir
  after update on public.orders
  for each row execute function public.fn_orders_relatorio_ao_concluir();

-- Limpeza de órfãos reconhece os PDFs
create or replace function public.arquivos_orfaos(p_min_idade_minutos int default 60)
returns table (nome text, bytes bigint, criado_em timestamptz) as $$
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then
    raise exception 'Sem permissão';
  end if;

  return query
  with arquivos as (
    select o.name,
           regexp_replace(o.name, '_mini\.jpg$', '.jpg') as base,
           (storage.foldername(o.name))[1] as tenant_pasta,
           coalesce((o.metadata->>'size')::bigint, 0) as tam,
           o.created_at
      from storage.objects o
     where o.bucket_id = 'evidencias'
       and o.created_at < now() - make_interval(mins => greatest(p_min_idade_minutos, 0))
       and (public.get_meu_role() = 'super_admin'
            or (storage.foldername(o.name))[1] = public.get_meu_tenant()::text)
  )
  select a.name, a.tam, a.created_at
    from arquivos a
   where a.base <> a.tenant_pasta || '/logo.png'
     and not exists (select 1 from public.order_evidences e where e.file_path = a.base)
     and not exists (select 1 from public.orders od where od.signature_path = a.base or od.technician_signature_path = a.base)
     and not exists (select 1 from public.order_reports r where r.file_path = a.base)
     and not exists (select 1 from public.users u
                      where a.base = a.tenant_pasta || '/assinaturas/tecnicos/' || u.id::text || '.png')
     and not exists (
       select 1
         from public.checklist_answers ca
         cross join lateral jsonb_each_text(case when jsonb_typeof(ca.value) = 'object' then ca.value else '{}'::jsonb end) v
        where v.value = a.base
     );
end;
$$ language plpgsql security definer stable;
