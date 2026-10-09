-- ============================================================
-- ATOS — Migration 054: consentimento de comunicação é opcional
-- ============================================================
-- LGPD: consentimento tem que ser livre. Termos de uso e aviso de
-- privacidade são obrigatórios para usar o portal; o consentimento de
-- comunicação (e-mail/WhatsApp) é OPCIONAL — quem recusa continua usando
-- o portal e não é perguntado de novo a cada login (só numa versão nova).
-- A recusa fica registrada como um aceite já retirado (revogado_em =
-- aceito_em), o que também é o formato da retirada futura nas preferências.
-- ============================================================

drop function if exists public.portal_aceitar_termos(uuid, uuid[]);

create or replace function public.portal_aceitar_termos(p_tenant uuid, p_aceitos uuid[], p_recusados uuid[] default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare v_h jsonb; v_ip text; v_ua text; v_n int := 0; v_id uuid; v_tipo text; v_recusa boolean;
begin
  if auth.uid() is null or not public.portal_tem_vinculo(p_tenant) then
    raise exception 'Sem acesso a este portal.';
  end if;
  begin v_h := current_setting('request.headers', true)::jsonb; exception when others then v_h := null; end;
  v_ip := split_part(coalesce(v_h->>'cf-connecting-ip', v_h->>'x-forwarded-for', v_h->>'x-real-ip', ''), ',', 1);
  v_ua := left(v_h->>'user-agent', 300);
  foreach v_id in array (coalesce(p_aceitos, '{}') || coalesce(p_recusados, '{}')) loop
    select x.tipo into v_tipo from public.portal_termos_vigentes(p_tenant) x where x.id = v_id;
    if v_tipo is null then raise exception 'Termo desatualizado. Recarregue a página.'; end if;
    v_recusa := v_id = any (coalesce(p_recusados, '{}'));
    if v_recusa and v_tipo <> 'comunicacao' then
      raise exception 'Os termos de uso e o aviso de privacidade precisam ser aceitos para usar o portal.';
    end if;
    if not exists (select 1 from public.termos_aceites where user_id = auth.uid() and tenant_id = p_tenant and termo_id = v_id) then
      insert into public.termos_aceites (user_id, tenant_id, termo_id, canal, ip, user_agent, aceito_em, revogado_em)
      values (auth.uid(), p_tenant, v_id, 'portal', nullif(v_ip, ''), v_ua, now(), case when v_recusa then now() end);
      v_n := v_n + 1;
    end if;
  end loop;
  perform public.fn_portal_auditar(p_tenant, 'termos_respondidos',
    jsonb_build_object('aceitos', p_aceitos, 'recusados', p_recusados));
  return v_n;
end $$;
revoke execute on function public.portal_aceitar_termos(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.portal_aceitar_termos(uuid, uuid[], uuid[]) to authenticated;

-- pendente = versão vigente sem NENHUMA resposta (aceite, recusa ou retirada)
create or replace function public.portal_meu_contexto(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p public.portal_pessoas; v_empresa text;
begin
  if auth.uid() is null then return jsonb_build_object('logado', false); end if;
  select * into v_p from public.portal_pessoas where user_id = auth.uid();
  if v_p.user_id is null or not public.portal_tem_vinculo(p_tenant) then
    return jsonb_build_object('logado', true, 'acesso', false,
      'interno', exists (select 1 from public.users where id = auth.uid()));
  end if;
  select coalesce(nullif(trim(trade_name), ''), name) into v_empresa from public.tenants where id = p_tenant;
  return jsonb_build_object('logado', true, 'acesso', true,
    'pessoa', jsonb_build_object('nome', v_p.nome, 'email', v_p.email),
    'vinculos', coalesce((select jsonb_agg(jsonb_build_object('client_id', c.id, 'cliente', c.name, 'perfil', v.perfil) order by c.name)
                          from public.portal_vinculos v join public.clients c on c.id = v.client_id
                          where v.user_id = auth.uid() and v.tenant_id = p_tenant and v.ativo), '[]'),
    'termos_pendentes', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'versao', x.versao, 'titulo', x.titulo,
                                    'texto', replace(x.texto, '{{empresa}}', v_empresa)) order by x.tipo desc)
                          from public.portal_termos_vigentes(p_tenant) x
                          where not exists (select 1 from public.termos_aceites a
                                            where a.user_id = auth.uid() and a.tenant_id = p_tenant and a.termo_id = x.id)), '[]'));
end $$;
