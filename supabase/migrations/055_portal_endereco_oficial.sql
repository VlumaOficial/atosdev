-- ============================================================
-- ATOS — Migration 055: portal — endereço oficial e restrição do caminho interno
-- ============================================================
-- Estrutura de endereços definida pelo usuário em 2026-10-09 (VISAO_ATOS.md
-- 9.1): o cliente do cliente entra SOMENTE por atendimento.<empresa>.<domínio>
-- (ou domínio próprio); o caminho /portal/<nome> no endereço do ATOS é só
-- prévia da equipe interna.
--
-- portal_resolver passa a devolver:
--   host_oficial — o endereço ativo e principal da empresa (null enquanto o
--                  subdomínio não existir: o caminho interno segue servindo)
--   interno      — quem consulta tem perfil interno (equipe da empresa)
-- O front redireciona quem não é da equipe do caminho interno (e de um
-- endereço antigo, depois de trocar o nome curto) para o endereço oficial.
-- ============================================================

create or replace function public.portal_resolver(p_slug text default null, p_host text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_t public.tenants; v_slug text := lower(trim(p_slug)); v_host text := lower(trim(p_host));
  v_plat public.portal_plataforma; v_novo text; v_previa boolean := false; v_oficial text;
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
  select e.host into v_oficial from public.portal_enderecos e
   where e.tenant_id = v_t.id and e.situacao = 'ativo' and e.principal order by e.criado_em desc limit 1;
  return jsonb_build_object(
    'disponivel', true, 'previa', v_previa,
    'interno', public.get_meu_role() <> 'nenhum',
    'host_oficial', v_oficial,
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
