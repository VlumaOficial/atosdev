-- ============================================================
-- ATOS — Roteiro de testes: grupos de atendimento, Atendente e transferência (E2)
-- ============================================================
-- Desfaz tudo no fim (rollback). Saída: {"falhas": N, "resultados": [...]}.
-- Pré-requisitos (massa de teste do DEV, empresa Infoxtec):
--   grupos "Central N1" (n1; coord. = Atendente Teste), "Redes N2" (n2; coord. =
--   Atendente Teste; membro = técnico teste2), "Campo Interior" (campo; assumir
--   LIGADO; coord. = admin; membros = técnicos "Infoxtec Teste" e "Teste02").
-- Uso: sql.sh supabase/tests/grupos_atendimento.sql
-- ============================================================
begin;

create temp table _r (n serial, teste text, ok boolean, detalhe text);
grant all on _r to authenticated;
grant usage on sequence _r_n_seq to authenticated;

create function pg_temp.como(p_uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); end $$;
create function pg_temp.reg(p_teste text, p_ok boolean, p_det text default null) returns void language plpgsql as $$
begin insert into _r (teste, ok, detalhe) values (p_teste, coalesce(p_ok, false), p_det); end $$;
-- chama algo que deve FALHAR com a mensagem informada
create function pg_temp.deve_falhar(p_teste text, p_sql text, p_trecho text) returns void language plpgsql as $$
declare v text;
begin
  begin execute p_sql; v := null;
  exception when others then v := sqlerrm; end;
  insert into _r (teste, ok, detalhe) values (p_teste, v is not null and v ilike '%' || p_trecho || '%', coalesce(v, 'NÃO falhou'));
end $$;

create temp table _id (k text primary key, v uuid);
grant select on _id to authenticated;
insert into _id select 'T', id from public.tenants where name like 'Infox%';
insert into _id select 'ADM', id from public.users where email = 'adm@infoxtec.com.br';
insert into _id select 'AT', id from public.users where email = 'atendente.teste@infoxtec.com.br';
insert into _id select 'T1', id from public.users where name = 'Infoxtec Teste' and role = 'tecnico';
insert into _id select 'T2', id from public.users where name = 'Teste02' and role = 'tecnico';
insert into _id select 'T3', id from public.users where name = 'teste2' and role = 'tecnico';
insert into _id select 'T4', id from public.users where name = 'Usuário Testes' and role = 'tecnico';
insert into _id select 'CLI', id from public.clients where tenant_id = (select v from _id where k = 'T') limit 1;
insert into _id select 'G1', id from public.grupos_atendimento where nome = 'Central N1';
insert into _id select 'G2', id from public.grupos_atendimento where nome = 'Redes N2';
insert into _id select 'GC', id from public.grupos_atendimento where nome = 'Campo Interior';
create function pg_temp.i(p_k text) returns uuid language sql stable as $$ select v from _id where k = p_k $$;

-- categoria de teste com grupo padrão = Central N1
insert into public.os_categorias (id, tenant_id, nome, grupo_padrao_id) values (gen_random_uuid(), pg_temp.i('T'), 'Teste roteamento E2', pg_temp.i('G1'));
insert into _id select 'CAT', id from public.os_categorias where nome = 'Teste roteamento E2';

-- ---------- 1. roteamento e criação ----------
select pg_temp.como(pg_temp.i('ADM')); set local role authenticated;
insert into public.orders (tenant_id, client_id, title, tipo, priority, created_by, categoria_id)
  values (pg_temp.i('T'), pg_temp.i('CLI'), 'E2 roteada', 'incidente', 'alto', pg_temp.i('ADM'), pg_temp.i('CAT'));
insert into public.orders (tenant_id, client_id, title, tipo, priority, created_by, grupo_id)
  values (pg_temp.i('T'), pg_temp.i('CLI'), 'E2 fila campo', 'incidente', 'alto', pg_temp.i('ADM'), pg_temp.i('GC'));
reset role;
insert into _id select 'A', id from public.orders where title = 'E2 roteada';
insert into _id select 'B', id from public.orders where title = 'E2 fila campo';
select pg_temp.reg('roteamento: OS com categoria ganha o grupo padrão', (select grupo_id = pg_temp.i('G1') from public.orders where id = pg_temp.i('A')));
select pg_temp.reg('OS criada direto no grupo fica sem técnico', (select grupo_id = pg_temp.i('GC') and technician_id is null from public.orders where id = pg_temp.i('B')));

-- ---------- 2. quem vê a fila ----------
select pg_temp.como(pg_temp.i('T1')); set local role authenticated;
select pg_temp.reg('técnico MEMBRO do grupo com Assumir vê a fila do grupo', (select count(*) = 1 from public.orders where id = pg_temp.i('B')));
select pg_temp.reg('técnico NÃO vê a fila de grupo em que não é membro', (select count(*) = 0 from public.orders where id = pg_temp.i('A')));
reset role;
select pg_temp.como(pg_temp.i('T3')); set local role authenticated;
select pg_temp.reg('técnico de OUTRO grupo (sem Assumir) não vê a fila do Campo', (select count(*) = 0 from public.orders where id = pg_temp.i('B')));
select pg_temp.reg('técnico sem a OS também não lê os eventos/comentários dela', (select count(*) = 0 from public.order_events where order_id = pg_temp.i('B')));
reset role;
select pg_temp.como(pg_temp.i('T4')); set local role authenticated;
select pg_temp.reg('técnico sem grupo só vê as próprias (nenhuma destas)', (select count(*) = 0 from public.orders where id in (pg_temp.i('A'), pg_temp.i('B'))));
reset role;

-- ---------- 3. assumir ----------
select pg_temp.como(pg_temp.i('T3')); set local role authenticated;
select pg_temp.deve_falhar('quem não é do grupo não assume', format('select public.assumir_os(%L)', pg_temp.i('B')), 'não está mais disponível');
reset role;
select pg_temp.como(pg_temp.i('T1')); set local role authenticated;
select public.assumir_os(pg_temp.i('B'));
reset role;
select pg_temp.reg('membro assume a OS da fila', (select technician_id = pg_temp.i('T1') from public.orders where id = pg_temp.i('B')));
select pg_temp.reg('assumir gera evento na linha do tempo', (select count(*) = 1 from public.order_events where order_id = pg_temp.i('B') and event_type = 'assumed'));
select pg_temp.como(pg_temp.i('T2')); set local role authenticated;
select pg_temp.deve_falhar('OS já assumida não pode ser assumida de novo', format('select public.assumir_os(%L)', pg_temp.i('B')), 'não está mais disponível');
reset role;

-- ---------- 4. transferir ----------
create temp table _prazo as select prazo_solucao p from public.orders where id = pg_temp.i('B');
grant select on _prazo to authenticated;
select pg_temp.como(pg_temp.i('T2')); set local role authenticated;
select pg_temp.deve_falhar('quem não é responsável nem coordenador não transfere', format('select public.transferir_os(%L, %L, null, %L)', pg_temp.i('B'), pg_temp.i('G2'), 'tentando sem direito'), 'Sem permissão');
reset role;
select pg_temp.como(pg_temp.i('T1')); set local role authenticated;
select pg_temp.deve_falhar('motivo é obrigatório', format('select public.transferir_os(%L, %L, null, %L)', pg_temp.i('B'), pg_temp.i('G2'), 'ok'), 'motivo');
select pg_temp.deve_falhar('sem destino não transfere', format('select public.transferir_os(%L, null, null, %L)', pg_temp.i('B'), 'sem destino algum'), 'Escolha o grupo');
select pg_temp.deve_falhar('técnico de destino precisa ser do grupo', format('select public.transferir_os(%L, %L, %L, %L)', pg_temp.i('B'), pg_temp.i('G2'), pg_temp.i('T2'), 'técnico fora do grupo'), 'não faz parte');
create temp table _t1 as select public.transferir_os(pg_temp.i('B'), pg_temp.i('G2'), null, 'Precisa de rede (N2)') j;
reset role;
select pg_temp.reg('técnico responsável transfere para outro grupo: Campo → N2 é "devolução"', (select j->>'direcao' = 'devolucao' from _t1));
select pg_temp.reg('transferir só para o grupo: OS cai na fila (sem técnico), no novo grupo',
  (select grupo_id = pg_temp.i('G2') and technician_id is null and transferencias = 1 from public.orders where id = pg_temp.i('B')));
select pg_temp.reg('o SLA NÃO reinicia na transferência', (select prazo_solucao is not distinct from (select p from _prazo) from public.orders where id = pg_temp.i('B')));
select pg_temp.reg('histórico de transferências gravado com motivo', (select count(*) = 1 from public.os_transferencias where order_id = pg_temp.i('B') and motivo = 'Precisa de rede (N2)'));
select pg_temp.reg('evento "transferred" com direção e grupos na linha do tempo',
  (select details->>'direcao' = 'devolucao' and details->>'to_group_name' = 'Redes N2' from public.order_events where order_id = pg_temp.i('B') and event_type = 'transferred' order by created_at desc limit 1));
select pg_temp.reg('coordenador do grupo de destino é avisado (e quem transferiu não)',
  (select count(*) = 1 from public.notificacoes where order_id = pg_temp.i('B') and tipo = 'transferida' and user_id = pg_temp.i('AT'))
  and (select count(*) = 0 from public.notificacoes where order_id = pg_temp.i('B') and user_id = pg_temp.i('T1')));
select pg_temp.como(pg_temp.i('T1')); set local role authenticated;
select pg_temp.reg('quem transferiu perde o acesso à OS', (select count(*) = 0 from public.orders where id = pg_temp.i('B')));
reset role;

-- Atendente transfere: só técnico (T3 participa só de Redes N2 → mesmo grupo = reatribuição)
select pg_temp.como(pg_temp.i('AT')); set local role authenticated;
create temp table _t2 as select public.transferir_os(pg_temp.i('B'), null, pg_temp.i('T3'), 'Atribuição direta ao técnico') j;
reset role;
select pg_temp.reg('Atendente transfere só para o técnico: grupo mantido, direção "reatribuição"', (select j->>'direcao' = 'reatribuicao' from _t2));
select pg_temp.como(pg_temp.i('T3')); set local role authenticated;
select pg_temp.reg('técnico de destino passa a ver a OS', (select count(*) = 1 from public.orders where id = pg_temp.i('B')));
reset role;

-- OS em andamento volta para "aberta" ao transferir (terceira transferência: pingue-pongue, limite 3)
update public.orders set status = 'em_andamento', started_at = now() where id = pg_temp.i('B');
select pg_temp.como(pg_temp.i('AT')); set local role authenticated;
create temp table _t3 as select public.transferir_os(pg_temp.i('B'), pg_temp.i('GC'), pg_temp.i('T2'), 'Precisa ir ao local') j;
reset role;
select pg_temp.reg('N2 → Campo é "escalonamento"', (select j->>'direcao' = 'escalonamento' from _t3));
select pg_temp.reg('OS em andamento transferida volta para "aberta"', (select status = 'aberta' and technician_id = pg_temp.i('T2') from public.orders where id = pg_temp.i('B')));
select pg_temp.reg('3ª transferência dispara o alerta de pingue-pongue', (select (j->>'pingue_pongue')::boolean from _t3));
select pg_temp.reg('pingue-pongue: coordenador/admin avisado uma única vez',
  (select count(*) = 1 from public.notificacoes where order_id = pg_temp.i('B') and tipo = 'pingue_pongue' and user_id = pg_temp.i('ADM')));
select pg_temp.como(pg_temp.i('T2')); set local role authenticated;
select pg_temp.reg('técnico vê o histórico de transferências da OS dele', (select count(*) = 3 from public.os_transferencias where order_id = pg_temp.i('B')));
reset role;

-- ---------- 5. direto na tabela: técnico não passa a OS por UPDATE ----------
select pg_temp.como(pg_temp.i('T2')); set local role authenticated;
select pg_temp.deve_falhar('técnico não troca o técnico por UPDATE direto', format('update public.orders set technician_id = %L where id = %L', pg_temp.i('T1'), pg_temp.i('B')), 'row-level security');
reset role;

-- ---------- 6. perfil Atendente ----------
select pg_temp.como(pg_temp.i('AT')); set local role authenticated;
select pg_temp.reg('Atendente vê todas as OS da empresa', (select count(*) >= 20 from public.orders));
insert into public.orders (tenant_id, client_id, title, tipo, priority, created_by) values (pg_temp.i('T'), pg_temp.i('CLI'), 'E2 aberta pelo atendente', 'incidente', 'baixo', pg_temp.i('AT'));
select pg_temp.reg('Atendente abre OS', (select count(*) = 1 from public.orders where title = 'E2 aberta pelo atendente'));
update public.orders set title = 'E2 editada pelo atendente' where title = 'E2 aberta pelo atendente';
select pg_temp.reg('Atendente edita OS', (select count(*) = 1 from public.orders where title = 'E2 editada pelo atendente'));
create temp table _del as with d as (delete from public.orders where title = 'E2 editada pelo atendente' returning 1) select count(*) n from d;
select pg_temp.reg('Atendente NÃO exclui OS', (select n = 0 from _del));
select pg_temp.deve_falhar('Atendente não cria cliente', format('insert into public.clients (tenant_id, name) values (%L, %L)', pg_temp.i('T'), 'Invasor'), 'row-level security');
create temp table _upd as with u as (update public.os_categorias set nome = 'Alterada' where id = pg_temp.i('CAT') returning 1) select count(*) n from u;
select pg_temp.reg('Atendente não altera o catálogo', (select n = 0 from _upd));
select pg_temp.deve_falhar('Atendente não vê o painel gerencial', 'select public.painel_gerencial(''{}''::jsonb)', 'Sem permiss');
select pg_temp.deve_falhar('Atendente não cria grupo', 'select public.salvar_grupo(null,''X'',null,''n1'',false,true,''[]'',''{}'')', 'Sem permiss');
create temp table _usr as with u as (update public.users set role = 'admin' where id = pg_temp.i('AT') returning 1) select count(*) n from u;
select pg_temp.reg('Atendente não se promove', (select n = 0 from _usr));
reset role;

-- ---------- 7. alertas de SLA chegam ao coordenador do grupo ----------
update public.orders set prazo_atendimento = now() - interval '2 hours', prazo_solucao = now() - interval '1 hour',
  risco_atendimento = now() - interval '3 hours', risco_solucao = now() - interval '2 hours', sla_alerta_risco_em = null, sla_alerta_vencido_em = null
 where id = pg_temp.i('A');
select public.verificar_alertas_sla();
select pg_temp.reg('SLA vencido avisa admin E o coordenador do grupo da OS',
  (select count(*) = 1 from public.notificacoes where order_id = pg_temp.i('A') and tipo = 'sla_vencido' and user_id = pg_temp.i('ADM'))
  and (select count(*) = 1 from public.notificacoes where order_id = pg_temp.i('A') and tipo = 'sla_vencido' and user_id = pg_temp.i('AT')));
select pg_temp.reg('técnico nunca recebe alerta de SLA do grupo', (select count(*) = 0 from public.notificacoes where order_id = pg_temp.i('A') and user_id in (pg_temp.i('T1'), pg_temp.i('T2'), pg_temp.i('T3'))));

select count(*) filter (where not ok) as falhas, count(*) as total,
       coalesce(json_agg(json_build_object('teste', teste, 'detalhe', detalhe) order by n) filter (where not ok), '[]') as detalhes
from _r;
rollback;
