-- ============================================================
-- ATOS — Migration 028 (F6): assinaturas no encerramento da OS
-- ============================================================
-- Decisões do usuário (2026-09-24):
--  1. assinatura do CLIENTE passa para o modal "Concluir atendimento"
--     (salva junto com a conclusão, não mais no corpo da OS)
--  2. obrigatoriedade continua configurável por empresa, mas o PADRÃO
--     passa a ser "exigir" — já ligado para a Infoxtec
--  3. exceção "Cliente não pôde assinar", com motivo obrigatório, só se
--     a empresa permitir (allow_signature_exception, padrão desligado)
--  4. assinatura do RESPONSÁVEL (quem conclui — técnico ou admin):
--     desenhada uma vez no perfil ({tenant}/assinaturas/tecnicos/{user}.png)
--     e COPIADA para a OS na conclusão ({tenant}/assinaturas/{os}_responsavel.png)
--     — cópia, pra que trocar a assinatura do perfil depois não altere
--     OS já concluídas
--
-- A regra "não conclui sem assinatura quando exigida" passa a valer NO
-- BANCO (gatilho), não só na tela — vale para técnico, admin e qualquer
-- origem.
-- ============================================================

alter table public.tenants alter column require_signature_to_complete set default true;
alter table public.tenants add column if not exists allow_signature_exception boolean not null default false;
update public.tenants set require_signature_to_complete = true where name ilike 'Infoxtec%';

alter table public.orders
  add column if not exists signature_absent_reason text,
  add column if not exists technician_signature_path text,
  add column if not exists technician_signer_name text,
  add column if not exists technician_signed_at timestamptz;

-- Config do tenant: parâmetros opcionais (null = mantém o valor atual)
drop function if exists public.atualizar_config_tenant(boolean);
create or replace function public.atualizar_config_tenant(
  p_require_signature boolean default null,
  p_allow_signature_exception boolean default null
)
returns void as $$
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then
    raise exception 'Sem permissão para alterar configurações do tenant';
  end if;
  update public.tenants
     set require_signature_to_complete = coalesce(p_require_signature, require_signature_to_complete),
         allow_signature_exception = coalesce(p_allow_signature_exception, allow_signature_exception)
   where id = public.get_meu_tenant();
end;
$$ language plpgsql security definer;

-- Gatilho: conclusão exige assinatura do cliente quando obrigatória
create or replace function public.fn_orders_exige_assinatura()
returns trigger as $$
declare
  v_exige boolean;
  v_permite_excecao boolean;
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    select coalesce(new.require_signature, t.require_signature_to_complete), t.allow_signature_exception
      into v_exige, v_permite_excecao
      from public.tenants t where t.id = new.tenant_id;

    if nullif(trim(coalesce(new.signature_absent_reason, '')), '') is not null and not coalesce(v_permite_excecao, false) then
      raise exception 'Esta empresa não permite concluir sem a assinatura do cliente';
    end if;
    if coalesce(v_exige, false)
       and new.signature_path is null
       and nullif(trim(coalesce(new.signature_absent_reason, '')), '') is null then
      raise exception 'Assinatura do cliente obrigatória para concluir este atendimento';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_orders_exige_assinatura on public.orders;
create trigger trg_orders_exige_assinatura
  before update on public.orders
  for each row execute function public.fn_orders_exige_assinatura();

-- Limpeza de órfãos (migration 024) precisa reconhecer as novas
-- referências: assinatura do responsável na OS e a do perfil de cada
-- usuário ativo. Sem isso a varredura apagaria esses arquivos.
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
