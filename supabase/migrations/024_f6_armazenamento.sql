-- ============================================================
-- ATOS — Migration 024 (F6): uso de armazenamento + detecção de órfãos
-- ============================================================
-- Auditoria de armazenamento (2026-09-23). Duas funções de CONSULTA
-- (SECURITY DEFINER, só admin/super_admin). A remoção dos arquivos em
-- si é feita pelo app via Storage API — o Supabase não permite apagar
-- direto em storage.objects por SQL (o arquivo físico ficaria para trás).
--
-- Tenant de cada arquivo = 1ª pasta do caminho ({tenant}/os/..., etc.).
-- Autor = storage.objects.owner (quem fez o upload).
-- ============================================================

-- Arquivos do bucket "evidencias" que nenhum registro referencia mais.
-- Referências válidas: order_evidences.file_path, valores das respostas
-- de checklist (checklist_answers.value, jsonb {campo: caminho}),
-- orders.signature_path e a logo do tenant. Miniatura (_mini.jpg) é
-- órfã quando a foto principal dela é órfã.
-- p_min_idade_minutos protege uploads em andamento (arquivo já subiu,
-- registro ainda não foi gravado).
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
     and not exists (select 1 from public.orders od where od.signature_path = a.base)
     and not exists (
       select 1
         from public.checklist_answers ca
         cross join lateral jsonb_each_text(case when jsonb_typeof(ca.value) = 'object' then ca.value else '{}'::jsonb end) v
        where v.value = a.base
     );
end;
$$ language plpgsql security definer stable;

-- Uso do armazenamento por tenant e por usuário (autor do upload).
-- Admin: só o próprio tenant. Super admin: todos os tenants.
create or replace function public.uso_armazenamento()
returns table (
  tenant_id uuid, tenant_nome text,
  usuario_id uuid, usuario_nome text, usuario_role text,
  fotos bigint, arquivos bigint, bytes bigint
) as $$
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then
    raise exception 'Sem permissão';
  end if;

  return query
  select t.id, t.name,
         o.owner, u.name, u.role,
         count(o.name) filter (
           where split_part(o.name, '/', 2) in ('os', 'checklist')
             and o.name not like '%\_mini.jpg'
         ),
         count(o.name),
         coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
    from public.tenants t
    left join storage.objects o
           on o.bucket_id = 'evidencias'
          and (storage.foldername(o.name))[1] = t.id::text
    left join public.users u on u.id = o.owner
   where public.get_meu_role() = 'super_admin' or t.id = public.get_meu_tenant()
   group by t.id, t.name, o.owner, u.name, u.role;
end;
$$ language plpgsql security definer stable;
