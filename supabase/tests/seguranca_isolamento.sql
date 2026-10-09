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
-- Uso: sql.sh supabase/tests/seguranca_isolamento.sql
-- ============================================================

begin;

create temp table _falhas (verificacao text, detalhe text) on commit drop;
grant insert, select on _falhas to anon, authenticated;

create temp table _alvo on commit drop as
  select p.user_id as uid,
         (select v.tenant_id from public.portal_vinculos v where v.user_id = p.user_id and v.ativo limit 1) as tenant,
         (select t.id from public.tenants t where t.id <> (select v.tenant_id from public.portal_vinculos v where v.user_id = p.user_id and v.ativo limit 1) limit 1) as outra
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
    perform public.portal_aceitar_termos(a.outra, (select array_agg(id) from public.termos where tenant_id is null));
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
  if public.painel_gerencial('{}'::jsonb) is not null then
    insert into _falhas values ('painel_gerencial', 'pessoa do portal leu o painel');
  end if;
exception when others then
  if sqlerrm not like '%Sem permiss%' and sqlerrm not like '%Acesso%' then
    insert into _falhas values ('funções do portal', sqlerrm);
  end if;
end $$;
reset role;

-- 4: funções SECURITY DEFINER sem checagem e fora da lista revisada
insert into _falhas
select 'função sem checagem', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('authenticated', p.oid, 'execute')
  and p.prorettype <> 'trigger'::regtype
  and p.prosrc !~ 'get_meu_tenant|get_meu_role|auth\.uid|pode_ver|portal_tem_vinculo'
  and p.proname not in (
    'provedor_geocodificacao',   -- devolve só o nome do provedor de mapas (usado na tela do técnico)
    'previa_liberar_espaco',     -- delega para arquivos_para_liberar/os_para_liberar, que checam papel
    'portal_resolver',           -- identidade pública do portal (desenho)
    'portal_termo_texto'         -- texto público dos termos vigentes (transparência LGPD)
  );

select count(*) as falhas, coalesce(json_agg(f order by f.verificacao, f.detalhe), '[]') as detalhes from _falhas f;
rollback;
