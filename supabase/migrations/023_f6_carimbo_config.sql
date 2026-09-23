-- ============================================================
-- ATOS — Migration 023 (F6): configuração dos campos do carimbo por tenant
-- ============================================================
-- Carimbo v2 (2026-09-23): o admin liga/desliga campos do carimbo das
-- fotos de evidência (logo, nome da empresa, hora, data, dia da semana,
-- endereço, coordenadas, nº da OS, técnico, unidade). A marca/selo ATOS
-- NÃO é configurável (decisão de produto — white-label só na F8).
--
-- stamp_config guarda SÓ o que difere do padrão ('{}' = padrão do
-- modelo aprovado). Os padrões ficam no frontend
-- (src/lib/carimboConfig.ts), junto com o desenho do carimbo.
--
-- Mesmo padrão da migration 018: admin não tem UPDATE em tenants (só
-- super_admin, por causa de plan/status), então a gravação passa por
-- função SECURITY DEFINER que aceita apenas chaves conhecidas com valor
-- booleano — nada fora da lista entra no banco.
-- ============================================================

alter table public.tenants
  add column if not exists stamp_config jsonb not null default '{}'::jsonb;

create or replace function public.atualizar_carimbo_tenant(p_config jsonb)
returns jsonb as $$
declare
  v_limpo jsonb;
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then
    raise exception 'Sem permissão para alterar configurações do tenant';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Configuração do carimbo inválida';
  end if;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_limpo
    from jsonb_each(p_config) as e
   where e.key in ('logo', 'nome_empresa', 'hora', 'data', 'dia_semana',
                   'endereco', 'coordenadas', 'numero_os', 'tecnico', 'unidade')
     and jsonb_typeof(e.value) = 'boolean';

  update public.tenants
     set stamp_config = v_limpo
   where id = public.get_meu_tenant();

  return v_limpo;
end;
$$ language plpgsql security definer;
