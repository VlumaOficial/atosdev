-- ============================================================
-- ATOS — Migration 032 (F6): "liberar espaço"
-- ============================================================
-- Decisões do usuário (2026-09-24): o cliente escolhe o PERÍODO; dois
-- níveis — (1) apaga fotos originais + miniaturas, MANTENDO o relatório
-- PDF (as fotos ficam dentro dele; PDFs faltantes são gerados antes);
-- (2) apaga fotos + PDFs, exige baixar o ZIP antes. Sempre: só OS
-- concluídas/canceladas (data de conclusão ou de cancelamento no
-- período), confirmação digitada, histórico de quem/quando/quanto.
-- Assinaturas e logo NÃO são apagadas (pequenas; assinatura é a prova
-- principal). Dados da OS, linha do tempo e códigos de verificação
-- permanecem — a verificação passa a dizer "removida pela empresa em…".
-- Remoção física pela Storage API (app); aqui: prévia, lista e registro.
-- ============================================================

alter table public.order_evidences add column if not exists arquivo_removido_em timestamptz;
alter table public.fotos_verificacao add column if not exists removido_em timestamptz;
alter table public.order_reports add column if not exists removido_em timestamptz;

create table if not exists public.liberacoes_espaco (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  executado_por uuid references public.users(id) on delete set null,
  executado_em timestamptz not null default now(),
  periodo_de date not null,
  periodo_ate date not null,
  nivel integer not null check (nivel in (1, 2)),
  qtd_os integer not null,
  qtd_arquivos integer not null,
  bytes bigint not null
);
alter table public.liberacoes_espaco enable row level security;
drop policy if exists liberacoes_espaco_select on public.liberacoes_espaco;
create policy liberacoes_espaco_select on public.liberacoes_espaco
  for select using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());

-- OS elegíveis do período (da empresa de quem chama)
create or replace function public.os_para_liberar(p_de date, p_ate date)
returns setof uuid as $$
  select o.id from public.orders o
   where o.tenant_id = public.get_meu_tenant()
     and o.status in ('concluida', 'cancelada')
     and coalesce(o.completed_at, o.updated_at)::date between p_de and p_ate;
$$ language sql security definer stable;

-- Arquivos que serão apagados (só os que existem no bucket), com tamanho
create or replace function public.arquivos_para_liberar(p_de date, p_ate date, p_nivel integer)
returns table (nome text, tipo text, bytes bigint, order_id uuid) as $$
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then raise exception 'Sem permissão'; end if;
  if p_nivel not in (1, 2) then raise exception 'Nível inválido'; end if;
  if p_de is null or p_ate is null or p_de > p_ate then raise exception 'Período inválido'; end if;

  return query
  with os as (select * from public.os_para_liberar(p_de, p_ate) as id),
  -- nível 1 só mexe em OS que têm o relatório PDF guardado (as fotos ficam
  -- dentro dele). OS cancelada não gera PDF → fotos dela só saem no nível
  -- 2, que exige baixar o ZIP antes. Nunca apaga foto sem registro.
  protegidas as (
    select o.id from os o
     where p_nivel = 2
        or exists (select 1 from public.order_reports r where r.order_id = o.id and r.status = 'gerado' and r.removido_em is null)
  ),
  alvos as (
    -- evidências da OS (+ miniatura)
    select e.file_path as base, 'foto'::text as tp, e.order_id as oid
      from public.order_evidences e where e.order_id in (select id from protegidas) and e.arquivo_removido_em is null
    union
    -- fotos de checklist das OS (+ miniatura)
    select v.value, 'foto', ci.order_id
      from public.checklist_instances ci
      join public.checklist_answers ca on ca.instance_id = ci.id
      cross join lateral jsonb_each_text(case when jsonb_typeof(ca.value) = 'object' then ca.value else '{}'::jsonb end) v
     where ci.order_id in (select id from protegidas) and v.value like '%/checklist/%.jpg'
    union
    -- relatórios PDF (só no nível 2)
    select r.file_path, 'pdf', r.order_id
      from public.order_reports r
     where p_nivel = 2 and r.order_id in (select id from os) and r.file_path is not null and r.removido_em is null
  )
  select so.name, a.tp, coalesce((so.metadata->>'size')::bigint, 0), a.oid
    from alvos a
    join storage.objects so on so.bucket_id = 'evidencias'
     and (so.name = a.base or (a.tp = 'foto' and so.name = regexp_replace(a.base, '\.jpg$', '') || '_mini.jpg'))
   where split_part(so.name, '/', 1) = public.get_meu_tenant()::text;
end;
$$ language plpgsql security definer stable;

-- Prévia para a tela: quantidades, tamanho e OS sem PDF (nível 1 gera antes)
create or replace function public.previa_liberar_espaco(p_de date, p_ate date, p_nivel integer)
returns table (qtd_os integer, qtd_fotos integer, qtd_pdfs integer, bytes bigint, os_ids uuid[], os_sem_pdf uuid[]) as $$
begin
  return query
  with arq as (select * from public.arquivos_para_liberar(p_de, p_ate, p_nivel)),
       os as (select id from public.os_para_liberar(p_de, p_ate) as id)
  select (select count(*)::int from os),
         (select count(*)::int from arq where tipo = 'foto' and nome not like '%\_mini.jpg'),
         (select count(*)::int from arq where tipo = 'pdf'),
         (select coalesce(sum(a.bytes), 0)::bigint from arq a),
         (select coalesce(array_agg(id), '{}') from os),
         (select coalesce(array_agg(o.id), '{}') from os o
           where not exists (select 1 from public.order_reports r where r.order_id = o.id and r.status = 'gerado' and r.removido_em is null)
             and (select status from public.orders where id = o.id) = 'concluida');
end;
$$ language plpgsql security definer stable;

-- Depois de apagar: marca o que foi removido e grava o histórico
create or replace function public.registrar_liberacao(p_de date, p_ate date, p_nivel integer, p_removidos text[], p_bytes bigint)
returns uuid as $$
declare
  v_tenant uuid := public.get_meu_tenant();
  v_id uuid;
  v_bases text[];
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then raise exception 'Sem permissão'; end if;
  if exists (select 1 from unnest(p_removidos) n where split_part(n, '/', 1) <> v_tenant::text) then
    raise exception 'Arquivo fora da pasta da empresa';
  end if;
  v_bases := array(select regexp_replace(n, '_mini\.jpg$', '.jpg') from unnest(p_removidos) n);

  update public.order_evidences set arquivo_removido_em = now()
   where tenant_id = v_tenant and file_path = any(v_bases) and arquivo_removido_em is null;
  update public.fotos_verificacao set removido_em = now()
   where tenant_id = v_tenant and file_path = any(p_removidos) and removido_em is null;
  update public.order_reports set removido_em = now()
   where tenant_id = v_tenant and file_path = any(p_removidos) and removido_em is null;

  insert into public.liberacoes_espaco (tenant_id, executado_por, periodo_de, periodo_ate, nivel, qtd_os, qtd_arquivos, bytes)
  values (v_tenant, auth.uid(), p_de, p_ate, p_nivel,
          (select count(*) from public.os_para_liberar(p_de, p_ate)), coalesce(array_length(p_removidos, 1), 0), coalesce(p_bytes, 0))
  returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer;
