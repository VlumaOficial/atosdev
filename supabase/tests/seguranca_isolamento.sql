-- ============================================================
-- ATOS — Roteiro automático de segurança (isolamento do portal)
-- ============================================================
-- Decisão do ponto 10 do portal (2026-10-08): rodar a cada mudança de
-- banco. Desfaz tudo no fim (rollback). Resultado: uma linha por falha
-- encontrada; nenhuma linha = tudo OK.
--
-- O que verifica:
--   1. Visitante anônimo não lê NENHUMA linha de NENHUMA tabela de public.
--   2. Pessoa do portal (portal.teste@example.com) não lê NENHUMA linha de
--      NENHUMA tabela de public — o portal só fala com o banco pelas
--      funções portal_*. Pega também tabelas criadas no futuro.
--   3. Nenhum dos dois lê arquivos do storage (exceto o bucket público da
--      logo do portal, que é público por desenho).
--   4. Toda função SECURITY DEFINER executável por usuários logados tem
--      checagem (get_meu_role/get_meu_tenant/auth.uid/pode_ver/
--      portal_tem_vinculo) ou está na lista revisada abaixo. Função nova
--      sem checagem quebra o teste até ser revisada.
--   5. As funções do portal não deixam a pessoa do portal ver outra empresa.
--   6. Usuário desativado perde o acesso (papel 'nenhum', sem empresa, sem ler nada).
-- Uso: sql.sh supabase/tests/seguranca_isolamento.sql
-- ============================================================

begin;

create temp table _falhas (verificacao text, detalhe text) on commit drop;
grant insert, select on _falhas to anon, authenticated;

create temp table _alvo on commit drop as
  select p.user_id as uid,
         (select v.tenant_id from public.portal_vinculos v where v.user_id = p.user_id and v.ativo limit 1) as tenant,
         (select t.id from public.tenants t where t.id <> (select v.tenant_id from public.portal_vinculos v where v.user_id = p.user_id and v.ativo limit 1) limit 1) as outra,
         (select v.client_id from public.portal_vinculos v where v.user_id = p.user_id and v.ativo limit 1) as meu_cliente,
         (select c.id from public.clients c where c.tenant_id = (select v.tenant_id from public.portal_vinculos v where v.user_id = p.user_id and v.ativo limit 1)
             and c.id <> (select v.client_id from public.portal_vinculos v where v.user_id = p.user_id and v.ativo limit 1) limit 1) as outro_cliente
  from public.portal_pessoas p where p.email = 'portal.teste@example.com';
grant select on _alvo to anon, authenticated;

do $$ begin
  if not exists (select 1 from _alvo) then
    insert into _falhas values ('preparo', 'pessoa de teste portal.teste@example.com não encontrada');
  end if;
end $$;

-- 1 e 2: varredura de todas as tabelas, como anônimo e como pessoa do portal
create or replace function pg_temp.varrer(p_papel text) returns void language plpgsql as $$
declare r record; n bigint;
begin
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') order by 1 loop
    begin
      -- keepalive_ping: tabela do keep-alive do Supabase, legível por anônimo por desenho (migration 015)
      if r.relname = 'keepalive_ping' and p_papel = 'anônimo' then continue; end if;
      execute format('select count(*) from public.%I', r.relname) into n;
      if n > 0 then insert into _falhas values (p_papel || ' lê tabela', r.relname || ' (' || n || ' linhas)'); end if;
    exception when insufficient_privilege then null;   -- sem permissão = bloqueado (ok)
    end;
  end loop;
  begin
    execute 'select count(*) from storage.objects where bucket_id <> ''portal-publico''' into n;
    if n > 0 then insert into _falhas values (p_papel || ' lê storage', n || ' arquivos'); end if;
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select pg_temp.varrer('anônimo');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select uid from _alvo), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.varrer('pessoa do portal');

-- 5: funções do portal com outra empresa
do $$
declare v jsonb; a record;
begin
  select * into a from _alvo;
  v := public.portal_meu_contexto(a.outra);
  if coalesce((v->>'acesso')::boolean, false) then
    insert into _falhas values ('portal_meu_contexto', 'deu acesso a outra empresa');
  end if;
  begin
    perform public.portal_aceitar_termos(a.outra, (select array_agg(id) from public.termos where tenant_id is null), '{}');
    insert into _falhas values ('portal_aceitar_termos', 'aceitou termos em outra empresa');
  exception when others then null;
  end;
  begin
    perform public.salvar_portal_config('{"slug":"invasor"}'::jsonb);
    insert into _falhas values ('salvar_portal_config', 'pessoa do portal salvou configuração');
  exception when others then null;
  end;
  begin
    perform public.publicar_termo('uso', 'x', 'texto de teste com mais de vinte letras', true);
    insert into _falhas values ('publicar_termo', 'pessoa do portal publicou termo');
  exception when others then null;
  end;
  -- E3: Supervisor de um cliente não gerencia OUTRO cliente da mesma empresa
  declare v_outro uuid; v_meu uuid;
  begin
    v_meu := a.meu_cliente; v_outro := a.outro_cliente;   -- calculados antes de trocar de papel
    if v_meu is null or v_outro is null then insert into _falhas values ('preparo E3', 'faltam clientes de teste'); end if;
    begin
      perform public.portal_listar_gestao(v_meu);   -- o próprio cliente tem que funcionar (senão os testes abaixo seriam vazios)
    exception when others then
      insert into _falhas values ('portal_listar_gestao', 'Supervisor não consegue gerenciar o PRÓPRIO cliente: ' || sqlerrm);
    end;
    begin
      perform public.portal_listar_gestao(v_outro);
      insert into _falhas values ('portal_listar_gestao', 'Supervisor leu a gestão de outro cliente');
    exception when others then null;
    end;
    begin
      perform public.portal_alterar_vinculo(v_outro, a.uid, 'supervisor', true);
      insert into _falhas values ('portal_alterar_vinculo', 'Supervisor alterou vínculo em outro cliente');
    exception when others then null;
    end;
    begin
      perform public.portal_salvar_equipe(v_outro, null, 'Invasora', '{}', '{}', true);
      insert into _falhas values ('portal_salvar_equipe', 'Supervisor criou equipe em outro cliente');
    exception when others then null;
    end;
    begin
      perform public.portal_exportar_pessoa(a.uid);
      insert into _falhas values ('portal_exportar_pessoa', 'pessoa do portal exportou dados');
    exception when others then null;
    end;
    begin
      perform public.definir_portal_cliente(v_meu, false);
      insert into _falhas values ('definir_portal_cliente', 'pessoa do portal desligou o portal do cliente');
    exception when others then null;
    end;
    begin
      perform public.portal_solicitacoes_empresa();
      insert into _falhas values ('portal_solicitacoes_empresa', 'pessoa do portal leu as solicitações da empresa');
    exception when others then null;
    end;
  end;
  begin
    perform public.painel_gerencial('{}'::jsonb);
    insert into _falhas values ('painel_gerencial', 'pessoa do portal leu o painel');
  exception when others then null;
  end;
  -- ATENÇÃO: sem EXCEPTION no bloco externo. Um tratador aqui DESFARIA as falhas já
  -- registradas acima (rollback do bloco) — foi assim que estas checagens ficaram
  -- vazias até 2026-10-09. Cada chamada que deve falhar tem o seu próprio sub-bloco.
end $$;
reset role;

-- 6: usuário DESATIVADO perde o acesso na hora (migration 059)
update public.users set active = false where email = 'atendente.teste@infoxtec.com.br';
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = 'atendente.teste@infoxtec.com.br'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if public.get_meu_role() <> 'nenhum' then insert into _falhas values ('usuário desativado', 'ainda tem papel: ' || public.get_meu_role()); end if;
  if public.get_meu_tenant() is not null then insert into _falhas values ('usuário desativado', 'ainda tem empresa'); end if;
  if (select count(*) from public.orders) > 0 then insert into _falhas values ('usuário desativado', 'ainda lê OS'); end if;
  if (select count(*) from public.clients) > 0 then insert into _falhas values ('usuário desativado', 'ainda lê clientes'); end if;
  if (select count(*) from public.grupos_atendimento) > 0 then insert into _falhas values ('usuário desativado', 'ainda lê grupos'); end if;
end $$;
reset role;

-- 4: funções SECURITY DEFINER sem checagem e fora da lista revisada
insert into _falhas
select 'função sem checagem', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('authenticated', p.oid, 'execute')
  and p.prorettype <> 'trigger'::regtype
  and p.prosrc !~ 'get_meu_tenant|get_meu_role|auth\.uid|pode_ver|portal_tem_vinculo|portal_papel_no_cliente|portal_perfil_no_cliente|portal_ve_chamado'
  and p.proname not in (
    'provedor_geocodificacao',   -- devolve só o nome do provedor de mapas (usado na tela do técnico)
    'previa_liberar_espaco',     -- delega para arquivos_para_liberar/os_para_liberar, que checam papel
    'portal_resolver',           -- identidade pública do portal (desenho)
    'portal_termo_texto'         -- texto público dos termos vigentes (transparência LGPD)
  );

select count(*) as falhas, coalesce(json_agg(f order by f.verificacao, f.detalhe), '[]') as detalhes from _falhas f;
rollback;
