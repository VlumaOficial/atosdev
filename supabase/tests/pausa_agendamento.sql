-- ============================================================
-- ATOS — Roteiro de testes: pausa com o cliente, "Aguardando você" e reagendamento que pausa o SLA (E5b parte 1)
-- ============================================================
-- Desfaz tudo no fim (rollback). Saída: {"falhas": N, "total": N, "detalhes": [...]}.
-- Pré-requisitos (massa de teste do DEV): empresa Infoxtec com o portal ativo,
-- clientes "Cliente Trigger Teste" (A) e "Atakarejo" (B), a Supervisora
-- portal.teste@example.com (A), o admin adm@infoxtec.com.br, o Atendente
-- atendente.teste@infoxtec.com.br, o técnico "Infoxtec Teste".
-- IMPORTANTE (lição de 2026-10-09): nada de EXCEPTION no bloco externo; cada
-- chamada que deve falhar usa pg_temp.deve_falhar. Valide o roteiro com uma
-- falha plantada antes de confiar nele.
-- Uso: sql.sh supabase/tests/pausa_agendamento.sql
-- ============================================================
begin;

create temp table _r (n serial, teste text, ok boolean, detalhe text);
grant all on _r to authenticated, anon;
grant usage on sequence _r_n_seq to authenticated, anon;
create temp table _id (k text primary key, v uuid);
grant select on _id to authenticated, anon;

create function pg_temp.i(p_k text) returns uuid language sql stable as $$ select v from _id where k = p_k $$;
create function pg_temp.como(p_k text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.i(p_k), 'role', 'authenticated')::text, true); end $$;
create function pg_temp.reg(p_teste text, p_ok boolean, p_det text default null) returns void language plpgsql as $$
begin insert into _r (teste, ok, detalhe) values (p_teste, coalesce(p_ok, false), p_det); end $$;
create function pg_temp.deve_falhar(p_teste text, p_sql text, p_trecho text) returns void language plpgsql as $$
declare v text;
begin
  begin execute p_sql; v := null; exception when others then v := sqlerrm; end;
  insert into _r (teste, ok, detalhe) values (p_teste, v is not null and v ilike '%' || p_trecho || '%', coalesce(v, 'NÃO falhou'));
end $$;

create function pg_temp.tenta(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;

-- ---------- massa ----------
insert into _id select 'T', id from public.tenants where name like 'Infox%';
insert into _id select 'A', id from public.clients where name = 'Cliente Trigger Teste';
insert into _id select 'B', id from public.clients where name = 'Atakarejo';
insert into _id select 'S', user_id from public.portal_pessoas where email = 'portal.teste@example.com';
insert into _id select 'ADM', id from public.users where email = 'adm@infoxtec.com.br';
insert into _id select 'AT', id from public.users where email = 'atendente.teste@infoxtec.com.br';
insert into _id select 'TEC', id from public.users where name = 'Infoxtec Teste' and role = 'tecnico';
insert into _id select 'TEC2', id from public.users where name = 'Teste02' and role = 'tecnico';
insert into _id select 'LA', id from public.locations where client_id = pg_temp.i('A') limit 1;
insert into _id select 'LB', id from public.locations where client_id = pg_temp.i('B') limit 1;
update public.clients set portal_ativo = true where id in (pg_temp.i('A'), pg_temp.i('B'));

-- pessoas do portal: U1, U2 (equipe E1), U3 (sem equipe) em A; X supervisor de B
do $$
declare k text; u uuid;
begin
  foreach k in array array['U1', 'U2', 'U3', 'X', 'Z'] loop
    u := gen_random_uuid();
    insert into auth.users (id, email, aud, role, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
    values (u, lower(k) || '.e4@example.com', 'authenticated', 'authenticated', '{"tipo":"portal"}', now(), now(), now());
    insert into public.portal_pessoas (user_id, nome, email, celular) values (u, 'Pessoa ' || k, lower(k) || '.e4@example.com', '71977776666');
    insert into _id values (k, u);
  end loop;
end $$;
-- termos obrigatórios aceitos (pré-requisito para abrir chamados)
insert into public.termos_aceites (user_id, tenant_id, termo_id, canal)
  select pg_temp.i(k), pg_temp.i('T'), x.id, 'portal' from unnest(array['U1','U2','U3','X']) k, public.portal_termos_vigentes(pg_temp.i('T')) x where x.tipo in ('uso', 'privacidade');
insert into public.portal_vinculos (user_id, tenant_id, client_id, perfil) values
  (pg_temp.i('U1'), pg_temp.i('T'), pg_temp.i('A'), 'usuario'), (pg_temp.i('U2'), pg_temp.i('T'), pg_temp.i('A'), 'usuario'),
  (pg_temp.i('U3'), pg_temp.i('T'), pg_temp.i('A'), 'usuario'), (pg_temp.i('X'), pg_temp.i('T'), pg_temp.i('B'), 'supervisor'),
  (pg_temp.i('Z'), pg_temp.i('T'), pg_temp.i('A'), 'usuario');   -- Z NÃO aceitou os termos
insert into public.portal_equipes (tenant_id, client_id, nome) values (pg_temp.i('T'), pg_temp.i('A'), 'Equipe E1');
insert into _id select 'E1', id from public.portal_equipes where nome = 'Equipe E1';
insert into public.portal_equipe_membros (equipe_id, user_id, tenant_id) values
  (pg_temp.i('E1'), pg_temp.i('U1'), pg_temp.i('T')), (pg_temp.i('E1'), pg_temp.i('U2'), pg_temp.i('T'));
-- catálogo: visível (incidente e visita), oculta (não decidida), filha de pai oculto, pai visível com filha visível
insert into public.os_categorias (tenant_id, nome, visivel_portal, tipos_portal, descricao_portal, impacto, urgencia)
  values (pg_temp.i('T'), 'T4 Visivel', true, '{incidente,visita}', 'Descrição para o cliente', 'medio', 'media');
insert into public.os_categorias (tenant_id, nome) values (pg_temp.i('T'), 'T4 Oculta');
insert into _id select 'CV', id from public.os_categorias where nome = 'T4 Visivel';
insert into _id select 'CO', id from public.os_categorias where nome = 'T4 Oculta';
insert into public.os_categorias (tenant_id, nome, pai_id, visivel_portal, tipos_portal) values (pg_temp.i('T'), 'T4 Filha de oculta', pg_temp.i('CO'), true, '{incidente}');
insert into _id select 'CF', id from public.os_categorias where nome = 'T4 Filha de oculta';
insert into public.os_categorias (tenant_id, nome, pai_id, visivel_portal, tipos_portal) values (pg_temp.i('T'), 'T4 Filha de visivel', pg_temp.i('CV'), true, '{incidente}');
insert into _id select 'CFV', id from public.os_categorias where nome = 'T4 Filha de visivel';
update public.tenants set portal_abertura = '{}' where id = pg_temp.i('T');   -- configuração padrão

-- grupo e categoria com grupo padrão (para a reclassificação mudar o roteamento)
insert into public.grupos_atendimento (tenant_id, nome, nivel) values (pg_temp.i('T'), 'T5 Grupo Rede', 'n2');
insert into _id select 'G', id from public.grupos_atendimento where nome = 'T5 Grupo Rede';
insert into public.grupo_membros (grupo_id, user_id, tenant_id, coordenador) values (pg_temp.i('G'), pg_temp.i('AT'), pg_temp.i('T'), true);
insert into public.os_categorias (tenant_id, nome, visivel_portal, tipos_portal, grupo_padrao_id) values (pg_temp.i('T'), 'T5 Rede', true, '{incidente}', pg_temp.i('G'));
insert into _id select 'CR', id from public.os_categorias where nome = 'T5 Rede';

-- chamado do portal (U1) e uma OS aberta pela equipe (sem solicitante)
select pg_temp.como('U1'); set local role authenticated;
create temp table _a1 as select public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'incidente', 'categoria_id', pg_temp.i('CV'),
  'location_id', pg_temp.i('LA'), 'titulo', 'Câmera sem imagem', 'descricao', 'A câmera da entrada parou de gravar desde ontem', 'impacto', 'alto', 'urgencia', 'alta')) j;
reset role;
insert into _id select 'O1', (j->>'id')::uuid from _a1;
insert into public.orders (tenant_id, client_id, title, tipo, priority, created_by) values (pg_temp.i('T'), pg_temp.i('A'), 'T5 OS interna', 'incidente', 'baixo', pg_temp.i('ADM'));
insert into _id select 'OI', id from public.orders where title = 'T5 OS interna';
insert into public.orders (tenant_id, client_id, title, tipo, priority, created_by, solicitante_id) values (pg_temp.i('T'), pg_temp.i('A'), 'T5 Visita do portal', 'visita', 'visita', pg_temp.i('ADM'), pg_temp.i('U1'));
insert into _id select 'OV', id from public.orders where title = 'T5 Visita do portal';
select pg_temp.reg('massa: chamado do portal criado sem resposta e sem triagem', (select respondido_em is null and classificada_em is null from public.orders where id = pg_temp.i('O1')));


-- motivos: um de cada comportamento
select pg_temp.como('ADM'); set local role authenticated;
insert into public.motivos_pausa (nome, para_sla, comportamento, texto_cliente, exige_previsao, ordem) values ('T6 Aguardando fornecedor', false, 'comunica', 'Aguardando o fornecedor', true, 20);
reset role;
insert into _id select 'MN', id from public.motivos_pausa where nome = 'T6 Aguardando fornecedor';
insert into _id select 'MA', id from public.motivos_pausa where tenant_id = pg_temp.i('T') and nome = 'Aguardando o cliente';
insert into _id select 'MC', id from public.motivos_pausa where tenant_id = pg_temp.i('T') and nome = 'Aguardando peça ou material';
insert into _id select 'MI', id from public.motivos_pausa where tenant_id = pg_temp.i('T') and nome = 'Outro';
select pg_temp.reg('motivos: o admin cadastra um motivo novo escolhendo comportamento, texto e previsão', (select comportamento = 'comunica' and texto_cliente = 'Aguardando o fornecedor' and exige_previsao from public.motivos_pausa where id = pg_temp.i('MN')));
select pg_temp.reg('motivos: os padrões nascem com comportamento (aciona / comunica / interno)',
  (select (select comportamento from public.motivos_pausa where id = pg_temp.i('MA')) = 'aciona' and (select comportamento from public.motivos_pausa where id = pg_temp.i('MC')) = 'comunica'
      and (select exige_previsao from public.motivos_pausa where id = pg_temp.i('MC')) and (select comportamento from public.motivos_pausa where id = pg_temp.i('MI')) = 'interno'));
select pg_temp.como('TEC'); set local role authenticated;
select pg_temp.deve_falhar('técnico não cadastra motivo de pausa', $q$insert into public.motivos_pausa (nome, comportamento) values ('T6 Indevido', 'interno')$q$, 'row-level security');
reset role;
select pg_temp.deve_falhar('comportamento inventado → recusado', $q$insert into public.motivos_pausa (tenant_id, nome, comportamento) select id, 'T6 Estranho', 'inventado' from public.tenants limit 1$q$, 'comportamento');

-- OS em andamento com o técnico responsável
update public.orders set technician_id = pg_temp.i('TEC'), status = 'em_andamento' where id = pg_temp.i('O1');

-- ---------- 1. pausa que ACIONA o cliente ----------
select pg_temp.como('TEC'); set local role authenticated;
select pg_temp.deve_falhar('pausa "aciona" sem a mensagem ao cliente → recusada', format('update public.orders set status = %L, pause_motivo_id = %L, pause_reason = %L where id = %L', 'pausada', pg_temp.i('MA'), 'Aguardando o cliente', pg_temp.i('O1')), 'mensagem ao cliente');
select public.os_comentar(pg_temp.i('O1'), 'Precisamos que alguém libere o acesso à sala do rack.', 'cliente');
update public.orders set status = 'pausada', pause_motivo_id = pg_temp.i('MA'), pause_reason = 'Aguardando o cliente' where id = pg_temp.i('O1');
reset role;
select pg_temp.reg('pausa "aciona": registra desde quando aguarda o cliente e para o relógio do SLA',
  (select aguardando_cliente_desde is not null and sla_pausado_desde is not null and status = 'pausada' from public.orders where id = pg_temp.i('O1')));
select pg_temp.como('U1'); set local role authenticated;
create temp table _p1 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
create temp table _l1 as select public.portal_listar_chamados(pg_temp.i('T'), 'abertos') j;
reset role;
select pg_temp.reg('portal: o cliente vê "Aguardando você" com o texto do motivo', (select (j->>'aguardando_voce')::boolean and j#>>'{pausa,tipo}' = 'aciona' and j#>>'{pausa,texto}' = 'Aguardando a sua resposta' from _p1));
select pg_temp.reg('portal: a mensagem pública da empresa está na conversa', (select exists (select 1 from jsonb_array_elements(j->'mensagens') m where m->>'texto' like 'Precisamos que alguém libere%') from _p1));
select pg_temp.reg('portal: a lista marca o chamado e conta quantos aguardam o cliente',
  (select (j#>>'{contagens,aguardando_voce}')::int = 1 and exists (select 1 from jsonb_array_elements(j->'itens') i where (i->>'aguardando_voce')::boolean) from _l1));
select pg_temp.como('U2'); set local role authenticated;
select pg_temp.reg('portal: a colega da equipe (compartilhado) também vê que aguarda resposta', (select (public.portal_obter_chamado(pg_temp.i('O1'))->>'aguardando_voce')::boolean));
reset role;

-- a resposta do cliente retoma a OS sozinha
select pg_temp.como('U1'); set local role authenticated;
create temp table _r1 as select public.portal_enviar_mensagem(pg_temp.i('O1'), 'Acesso liberado, podem ir.') j;
reset role;
select pg_temp.reg('resposta do cliente: a OS volta a "em andamento", o relógio retoma e o "aguardando" é limpo',
  (select status = 'em_andamento' and aguardando_cliente_desde is null and sla_pausado_desde is null from public.orders where id = pg_temp.i('O1')),
  (select concat_ws(' | ', status, aguardando_cliente_desde::text, sla_pausado_desde::text) from public.orders where id = pg_temp.i('O1')));
select pg_temp.reg('resposta do cliente: registra o evento "resumed" por cliente e avisa o técnico que a OS foi retomada',
  (select exists (select 1 from public.order_events where order_id = pg_temp.i('O1') and event_type = 'resumed' and details->>'por' = 'cliente')
      and exists (select 1 from public.notificacoes where user_id = pg_temp.i('TEC') and order_id = pg_temp.i('O1') and titulo like '%foi retomada%') from _r1));
select pg_temp.reg('resposta do cliente: a função devolve que retomou', (select (j->>'retomou')::boolean from _r1));

-- ---------- 2. pausa que COMUNICA (com previsão) ----------
select pg_temp.como('TEC'); set local role authenticated;
select pg_temp.deve_falhar('pausa "comunica" que exige previsão, sem previsão → recusada', format('update public.orders set status = %L, pause_motivo_id = %L where id = %L', 'pausada', pg_temp.i('MC'), pg_temp.i('O1')), 'previsão');
select pg_temp.deve_falhar('previsão no passado → recusada', format('update public.orders set status = %L, pause_motivo_id = %L, previsao_retorno = now() - interval %L where id = %L', 'pausada', pg_temp.i('MC'), '1 day', pg_temp.i('O1')), 'futura');
update public.orders set status = 'pausada', pause_motivo_id = pg_temp.i('MC'), previsao_retorno = now() + interval '3 days' where id = pg_temp.i('O1');
reset role;
select pg_temp.como('U1'); set local role authenticated;
create temp table _p2 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('pausa "comunica": o cliente vê o texto e a previsão (sem "aguardando você")',
  (select not (j->>'aguardando_voce')::boolean and j#>>'{pausa,tipo}' = 'comunica' and j#>>'{pausa,texto}' = 'Aguardando peça ou material' and j#>>'{pausa,previsao}' is not null from _p2));
-- previsão vencida: avisa o responsável uma vez
update public.orders set previsao_retorno = now() - interval '1 hour' where id = pg_temp.i('O1');
create temp table _v1 as select public.verificar_previsoes_pausa() n;   -- a rotina roda em comando separado (o snapshot do SELECT não enxerga o que ela grava)
select pg_temp.reg('rotina: previsão vencida gera o alerta ao técnico responsável', (select n >= 1 from _v1)
  and exists (select 1 from public.notificacoes where user_id = pg_temp.i('TEC') and order_id = pg_temp.i('O1') and tipo = 'previsao_vencida'));
create temp table _v2 as select public.verificar_previsoes_pausa() n;
select pg_temp.reg('rotina: não repete o alerta enquanto a previsão for a mesma',
  (select count(*) = 1 from public.notificacoes where order_id = pg_temp.i('O1') and tipo = 'previsao_vencida' and user_id = pg_temp.i('TEC')) and (select n = 0 from _v2));
update public.orders set previsao_retorno = now() - interval '2 hours' where id = pg_temp.i('O1');
create temp table _v3 as select public.verificar_previsoes_pausa() n;
select pg_temp.reg('rotina: nova previsão (vencida de novo) volta a alertar', (select n >= 1 from _v3)
  and (select count(*) = 2 from public.notificacoes where order_id = pg_temp.i('O1') and tipo = 'previsao_vencida' and user_id = pg_temp.i('TEC')));
update public.orders set status = 'em_andamento' where id = pg_temp.i('O1');
select pg_temp.reg('ao retomar, a previsão e o alerta são limpos', (select previsao_retorno is null and previsao_alertada_em is null and aguardando_cliente_desde is null from public.orders where id = pg_temp.i('O1')));

-- ---------- 3. pausa INTERNA: o cliente vê só "em andamento" ----------
select pg_temp.como('TEC'); set local role authenticated;
update public.orders set status = 'pausada', pause_motivo_id = pg_temp.i('MI'), pause_reason = 'Outro' where id = pg_temp.i('O1');
reset role;
select pg_temp.como('U1'); set local role authenticated;
create temp table _p3 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('pausa "interno": o cliente não vê pausa nem "aguardando você"', (select j->'pausa' is null or j->>'pausa' is null and not (j->>'aguardando_voce')::boolean from _p3));
select pg_temp.reg('pausa "interno": o status que o cliente vê continua "em atendimento"', (select j->>'status' = 'em_atendimento' from _p3));
update public.orders set status = 'em_andamento' where id = pg_temp.i('O1');

-- OS aberta pela equipe (sem solicitante): a pausa "aciona" não exige mensagem
update public.orders set status = 'em_andamento' where id = pg_temp.i('OI');
select pg_temp.como('ADM'); set local role authenticated;
update public.orders set status = 'pausada', pause_motivo_id = pg_temp.i('MA'), pause_reason = 'Aguardando o cliente' where id = pg_temp.i('OI');
reset role;
select pg_temp.reg('OS sem solicitante: pausa "aciona" não exige mensagem e não marca "aguardando você"', (select status = 'pausada' and aguardando_cliente_desde is null from public.orders where id = pg_temp.i('OI')));

-- ---------- 4. agendar a pedido do cliente PAUSA o SLA (mantém o tempo gasto) ----------
select pg_temp.como('U1'); set local role authenticated;
create temp table _a2 as select public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'incidente', 'categoria_id', pg_temp.i('CV'),
  'location_id', pg_temp.i('LA'), 'titulo', 'Segundo chamado', 'descricao', 'Segundo chamado para testar o reagendamento', 'impacto', 'alto', 'urgencia', 'alta')) j;
reset role;
insert into _id select 'O2', (j->>'id')::uuid from _a2;
create temp table _s0 as select sla_base b, prazo_solucao ps, prazo_atendimento pa, created_at c from public.orders where id = pg_temp.i('O2');
select pg_temp.reg('antes: o chamado tem SLA e nenhum crédito de agendamento', (select ps is not null and pa is not null from _s0));
select pg_temp.como('AT'); set local role authenticated;
update public.orders set status = 'agendada', scheduled_at = now() + interval '7 days', agendado_pelo_cliente = true where id = pg_temp.i('O2');
reset role;
create temp table _s1 as select sla_base b, prazo_solucao ps, prazo_atendimento pa, sla_agend_min m, sla_agend_aberto_min ab, reagendamentos r from public.orders where id = pg_temp.i('O2');
select pg_temp.reg('agendar a pedido do cliente: a base do SLA NÃO muda (o tempo já gasto é mantido)', (select (select b from _s1) = (select b from _s0)));
select pg_temp.reg('agendar a pedido do cliente: o tempo até a data vira crédito e os prazos de atendimento e solução andam',
  (select m > 0 and ab = m and r = 1 and ps > (select ps from _s0) and pa > (select pa from _s0) from _s1),
  (select concat_ws(' | ', m::text, ab::text, r::text) from _s1));
select pg_temp.como('AT'); set local role authenticated;
update public.orders set scheduled_at = now() + interval '14 days' where id = pg_temp.i('O2');
reset role;
create temp table _s2 as select prazo_solucao ps, sla_agend_min m, sla_agend_aberto_min ab, reagendamentos r from public.orders where id = pg_temp.i('O2');
select pg_temp.reg('reagendar para mais tarde: o crédito é refeito (maior), conta 2 agendamentos e o prazo anda de novo',
  (select m > (select m from _s1) and r = 2 and ab = m and ps > (select ps from _s1) from _s2), (select concat_ws(' | ', m::text, ab::text, r::text) from _s2));
select pg_temp.como('TEC'); set local role authenticated;
update public.orders set technician_id = pg_temp.i('TEC') where id = pg_temp.i('O2');
reset role;
update public.orders set status = 'em_andamento' where id = pg_temp.i('O2');
create temp table _s3 as select prazo_solucao ps, sla_agend_min m, sla_agend_aberto_min ab, sla_agend_desde d from public.orders where id = pg_temp.i('O2');
select pg_temp.reg('iniciar antes da data: o crédito é acertado pelo tempo realmente decorrido (devolve o que não foi usado)',
  (select ab = 0 and d is null and m < 5 and ps < (select ps from _s2) from _s3), (select concat_ws(' | ', m::text, ab::text) from _s3));

-- limite de agendamentos por chamado (configurável)
update public.tenants set sla_limite_reagendamentos = 2 where id = pg_temp.i('T');
select pg_temp.como('U1'); set local role authenticated;
create temp table _a3 as select public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'incidente', 'categoria_id', pg_temp.i('CV'),
  'location_id', pg_temp.i('LA'), 'titulo', 'Terceiro chamado', 'descricao', 'Terceiro chamado para testar o limite', 'impacto', 'alto', 'urgencia', 'alta')) j;
reset role;
insert into _id select 'O3', (j->>'id')::uuid from _a3;
update public.orders set status = 'agendada', scheduled_at = now() + interval '5 days', agendado_pelo_cliente = true where id = pg_temp.i('O3');
update public.orders set scheduled_at = now() + interval '6 days' where id = pg_temp.i('O3');
select pg_temp.deve_falhar('limite: o 3º agendamento a pedido do cliente é recusado (limite 2)', format('update public.orders set scheduled_at = now() + interval %L where id = %L', '7 days', pg_temp.i('O3')), 'limite');
update public.tenants set sla_limite_reagendamentos = 0 where id = pg_temp.i('T');
update public.orders set scheduled_at = now() + interval '8 days' where id = pg_temp.i('O3');
update public.orders set scheduled_at = now() + interval '9 days' where id = pg_temp.i('O3');
select pg_temp.reg('limite 0 = sem limite', (select reagendamentos >= 4 from public.orders where id = pg_temp.i('O3')));
select pg_temp.como('ADM'); set local role authenticated;
select public.definir_limite_reagendamentos(5);
select pg_temp.deve_falhar('limite fora de 0 a 20 → recusado', 'select public.definir_limite_reagendamentos(25)', '0 a 20');
reset role;
select pg_temp.reg('o admin define o limite da empresa', (select sla_limite_reagendamentos = 5 from public.tenants where id = pg_temp.i('T')));
select pg_temp.como('TEC'); set local role authenticated;
select pg_temp.deve_falhar('técnico não define o limite', 'select public.definir_limite_reagendamentos(1)', 'Sem permissão');
reset role;
-- visita não tem SLA: agendar a pedido do cliente não gera crédito
update public.orders set status = 'agendada', scheduled_at = now() + interval '4 days', agendado_pelo_cliente = true where id = pg_temp.i('OV');
select pg_temp.reg('visita: agendar a pedido do cliente não gera crédito nem erro (sem SLA)', (select sla_agend_min = 0 and reagendamentos = 0 from public.orders where id = pg_temp.i('OV')));

select count(*) filter (where not ok) as falhas, count(*) as total,
       coalesce(json_agg(json_build_object('teste', teste, 'detalhe', detalhe) order by n) filter (where not ok), '[]') as detalhes
from _r;
rollback;
