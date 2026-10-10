-- ============================================================
-- ATOS — Roteiro de testes: agendamento combinado, calendário configurável, reagendar/cancelar pelo cliente e lembretes (E5b parte 3)
-- ============================================================
-- Desfaz tudo no fim (rollback). Saída: {"falhas": N, "total": N, "detalhes": [...]}.
-- Pré-requisitos (massa de teste do DEV): empresa Infoxtec com o portal ativo,
-- clientes "Cliente Trigger Teste" (A) e "Atakarejo" (B), a Supervisora
-- portal.teste@example.com (A), o admin adm@infoxtec.com.br, o Atendente
-- atendente.teste@infoxtec.com.br, o técnico "Infoxtec Teste".
-- IMPORTANTE (lição de 2026-10-09): nada de EXCEPTION no bloco externo; cada
-- chamada que deve falhar usa pg_temp.deve_falhar. Valide o roteiro com uma
-- falha plantada antes de confiar nele.
-- Uso: sql.sh supabase/tests/agendamento_combinado.sql
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



update public.tenants set agendamento_config = '{}'::jsonb where id = pg_temp.i('T');
insert into _id values ('D1', gen_random_uuid());   -- só para ter um id de apoio
create function pg_temp.dia(p_n int) returns text language sql stable as $$ select to_char(current_date + p_n, 'YYYY-MM-DD') $$;
create function pg_temp.visita(p_titulo text, p_prefs jsonb) returns uuid language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.como('U1'); set local role authenticated;
  v := public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'visita', 'categoria_id', pg_temp.i('CV'), 'titulo', p_titulo, 'descricao', 'Visita técnica para teste de agendamento', 'preferencias', p_prefs));
  reset role;
  return (v->>'id')::uuid;
end $$;

-- ---------- 1. regras da empresa ----------
select pg_temp.reg('padrões: 48 h de antecedência, janelas Manhã/Tarde e lembretes de 48 h e 24 h',
  (select c->>'antecedencia_horas' = '48' and c#>>'{janelas,manha,inicio}' = '08:00' and c#>>'{janelas,tarde,nome}' = 'Tarde' and jsonb_array_length(c->'lembretes') = 2 and (c->>'cliente_reagenda')::boolean from (select public.agendamento_efetivo(pg_temp.i('T')) c) x));
select pg_temp.como('ADM'); set local role authenticated;
select public.salvar_agendamento_config('{"antecedencia_horas":72,"horizonte_dias":30,"janelas":{"manha":{"nome":"Manhã cedo","inicio":"07:00","fim":"11:00"},"tarde":{"nome":"Tarde","inicio":"14:00","fim":"17:00"}},"cliente_reagenda":true,"reagendar_antecedencia_horas":12,"max_reagendamentos_cliente":2,"reagendar_motivo_obrigatorio":false,"cliente_cancela":true,"cancelar_antecedencia_horas":12,"lembretes":[{"antes_horas":72},{"antes_horas":24},{"antes_horas":2}]}'::jsonb);
reset role;
select pg_temp.reg('o admin salva as regras (antecedência, horizonte, janelas, limites e até 3 lembretes)',
  (select c->>'antecedencia_horas' = '72' and c->>'horizonte_dias' = '30' and c#>>'{janelas,manha,nome}' = 'Manhã cedo' and c#>>'{janelas,tarde,inicio}' = '14:00' and jsonb_array_length(c->'lembretes') = 3 from (select public.agendamento_efetivo(pg_temp.i('T')) c) x));
select pg_temp.como('ADM'); set local role authenticated;
select pg_temp.deve_falhar('antecedência acima de 720 h → recusada', $q$select public.salvar_agendamento_config('{"antecedencia_horas":800}'::jsonb)$q$, '720');
select pg_temp.deve_falhar('horizonte menor que a antecedência → recusado', $q$select public.salvar_agendamento_config('{"antecedencia_horas":240,"horizonte_dias":5}'::jsonb)$q$, 'maior');
select pg_temp.deve_falhar('janela com início depois do fim → recusada', $q$select public.salvar_agendamento_config('{"janelas":{"manha":{"inicio":"12:00","fim":"08:00"}}}'::jsonb)$q$, 'janela');
select pg_temp.deve_falhar('janela com hora inválida → recusada', $q$select public.salvar_agendamento_config('{"janelas":{"manha":{"inicio":"25:00","fim":"26:00"}}}'::jsonb)$q$, 'janela');
select pg_temp.deve_falhar('mais de 3 lembretes → recusado', $q$select public.salvar_agendamento_config('{"lembretes":[{"antes_horas":1},{"antes_horas":2},{"antes_horas":3},{"antes_horas":4}]}'::jsonb)$q$, 'No máximo 3');
select pg_temp.deve_falhar('lembrete de 0 hora → recusado', $q$select public.salvar_agendamento_config('{"lembretes":[{"antes_horas":0}]}'::jsonb)$q$, '1 a 720');
select pg_temp.deve_falhar('limite de reagendamentos acima de 10 → recusado', $q$select public.salvar_agendamento_config('{"max_reagendamentos_cliente":11}'::jsonb)$q$, '0 a 10');
reset role;
select pg_temp.como('AT'); set local role authenticated;
select pg_temp.deve_falhar('atendente não configura o agendamento', $q$select public.salvar_agendamento_config('{}'::jsonb)$q$, 'administrador');
reset role;
select pg_temp.como('TEC'); set local role authenticated;
select pg_temp.deve_falhar('técnico não configura o agendamento', $q$select public.salvar_agendamento_config('{}'::jsonb)$q$, 'administrador');
reset role;
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('pessoa do portal não configura o agendamento', $q$select public.salvar_agendamento_config('{}'::jsonb)$q$, 'administrador');
create temp table _cf as select public.portal_abertura_config(pg_temp.i('A')) j;
reset role;
select pg_temp.reg('a tela de abrir recebe as regras: data mínima, máxima e janelas com os nomes da empresa',
  (select j#>>'{agendamento,data_minima}' = to_char((now() at time zone 'America/Sao_Paulo') + interval '72 hours', 'YYYY-MM-DD') and j#>>'{agendamento,janelas,manha,nome}' = 'Manhã cedo' and (j#>>'{agendamento,data_maxima}')::date >= current_date + 29 from _cf),
  (select j->>'agendamento' from _cf));

-- ---------- 2. as datas que o cliente pede seguem a regra ----------
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('data antes da antecedência mínima (72 h) → recusada', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','visita','categoria_id',%L,'titulo','Visita cedo','descricao','Visita técnica para teste','preferencias',jsonb_build_array(jsonb_build_object('data',%L,'periodo','manha'))))$q$, pg_temp.i('A'), pg_temp.i('CV'), pg_temp.dia(1)), 'a partir de');
select pg_temp.deve_falhar('data além do horizonte (30 dias) → recusada', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','visita','categoria_id',%L,'titulo','Visita longe','descricao','Visita técnica para teste','preferencias',jsonb_build_array(jsonb_build_object('data',%L,'periodo','manha'))))$q$, pg_temp.i('A'), pg_temp.i('CV'), pg_temp.dia(45)), 'até');
select pg_temp.deve_falhar('período inventado → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','visita','categoria_id',%L,'titulo','Visita estranha','descricao','Visita técnica para teste','preferencias',jsonb_build_array(jsonb_build_object('data',%L,'periodo','madrugada'))))$q$, pg_temp.i('A'), pg_temp.i('CV'), pg_temp.dia(6)), 'Período');
select pg_temp.reg('calendário: data depois do horizonte → "Escolha uma data até…"', public.portal_avisos_data(pg_temp.i('A'), pg_temp.i('LA'), current_date + 40) like 'Escolha uma data até %');
reset role;
-- visita do portal com 2 opções dentro da regra
insert into _id values ('V1', pg_temp.visita('Visita com opções', jsonb_build_array(jsonb_build_object('data', pg_temp.dia(6), 'periodo', 'manha'), jsonb_build_object('data', pg_temp.dia(8), 'periodo', 'tarde'))));
select pg_temp.reg('visita com datas dentro da regra é aberta', (select preferencia_agendamento is not null and tipo = 'visita' from public.orders where id = pg_temp.i('V1')));

-- ---------- 3. agendamento combinado: confirmado × proposto ----------
update public.orders set status = 'agendada', scheduled_at = (pg_temp.dia(6) || ' 09:00-03')::timestamptz where id = pg_temp.i('V1');
select pg_temp.reg('agendar numa das datas pedidas → confirmado', (select agendamento_status = 'confirmado' and agendamento_cliente_em is null from public.orders where id = pg_temp.i('V1')));
update public.orders set scheduled_at = (pg_temp.dia(10) || ' 09:00-03')::timestamptz where id = pg_temp.i('V1');
select pg_temp.reg('agendar numa data que o cliente NÃO pediu → proposta', (select agendamento_status = 'proposto' from public.orders where id = pg_temp.i('V1')));
update public.orders set status = 'aberta' where id = pg_temp.i('V1');
select pg_temp.reg('sair de "agendada" limpa o estado do agendamento', (select agendamento_status is null from public.orders where id = pg_temp.i('V1')));
update public.orders set status = 'agendada', scheduled_at = (pg_temp.dia(11) || ' 09:00-03')::timestamptz, agendado_pelo_cliente = true where id = pg_temp.i('V1');
select pg_temp.reg('combinado com o cliente ("a pedido do cliente") → confirmado', (select agendamento_status = 'confirmado' from public.orders where id = pg_temp.i('V1')));
update public.orders set agendado_pelo_cliente = false, scheduled_at = (pg_temp.dia(12) || ' 09:00-03')::timestamptz where id = pg_temp.i('V1');
update public.orders set status = 'agendada', scheduled_at = (pg_temp.dia(12) || ' 09:00-03')::timestamptz where id = pg_temp.i('OI');
select pg_temp.reg('OS aberta pela equipe (sem solicitante) não tem estado de agendamento', (select agendamento_status is null and status = 'agendada' from public.orders where id = pg_temp.i('OI')));

-- ---------- 4. o cliente responde à proposta ----------
select pg_temp.como('U1'); set local role authenticated;
create temp table _g1 as select public.portal_obter_chamado(pg_temp.i('V1'))->'agendamento' j;
reset role;
select pg_temp.reg('proposta: o cliente vê a data, pode aceitar e pode pedir outra', (select j->>'status' = 'proposto' and (j->>'pode_aceitar')::boolean and (j->>'pode_pedir_outra')::boolean from _g1), (select j::text from _g1));
select pg_temp.como('U3'); set local role authenticated;
select pg_temp.deve_falhar('pessoa de fora da equipe não aceita', format('select public.portal_responder_agendamento(%L, %L)', pg_temp.i('V1'), 'aceitar'), 'Chamado não encontrado');
reset role;
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('ação inventada → recusada', format('select public.portal_responder_agendamento(%L, %L)', pg_temp.i('V1'), 'apagar'), 'Ação inválida');
select pg_temp.deve_falhar('pedir outra data sem opção → recusado', format('select public.portal_responder_agendamento(%L, %L, %L::jsonb)', pg_temp.i('V1'), 'outra_data', '[]'), 'pelo menos uma');
select pg_temp.deve_falhar('pedir outra data antes da antecedência → recusado', format($q$select public.portal_responder_agendamento(%L, 'outra_data', jsonb_build_array(jsonb_build_object('data', %L, 'periodo', 'manha')))$q$, pg_temp.i('V1'), pg_temp.dia(1)), 'a partir de');
select public.portal_responder_agendamento(pg_temp.i('V1'), 'outra_data', jsonb_build_array(jsonb_build_object('data', pg_temp.dia(14), 'periodo', 'tarde')), 'Dia 12 não dá para nós');
reset role;
select pg_temp.reg('recusar a proposta: vira "reagendamento pedido", troca as datas pedidas e NÃO gasta o limite do cliente',
  (select agendamento_status = 'reagendamento_pedido' and preferencia_agendamento->0->>'data' = pg_temp.dia(14) and reagendamentos_cliente = 0 and reagendamento_motivo like 'Dia 12%' from public.orders where id = pg_temp.i('V1')));
select pg_temp.reg('recusar a proposta: o responsável é avisado no sino e o evento é registrado',
  (select exists (select 1 from public.notificacoes where order_id = pg_temp.i('V1') and tipo = 'reagendamento_pedido') and exists (select 1 from public.order_events where order_id = pg_temp.i('V1') and event_type = 'reschedule_requested') from _g1));
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('já pediu outra data → aguarda a empresa', format($q$select public.portal_responder_agendamento(%L, 'outra_data', jsonb_build_array(jsonb_build_object('data', %L, 'periodo', 'manha')))$q$, pg_temp.i('V1'), pg_temp.dia(15)), 'já pediu');
select pg_temp.deve_falhar('aceitar enquanto aguarda a empresa → recusado', format('select public.portal_responder_agendamento(%L, %L)', pg_temp.i('V1'), 'aceitar'), 'Não há data');
reset role;
-- a equipe agenda numa das novas datas → confirmado e o pedido é limpo
update public.orders set scheduled_at = (pg_temp.dia(14) || ' 14:00-03')::timestamptz where id = pg_temp.i('V1');
select pg_temp.reg('a equipe agenda numa das novas datas → confirmado e o pedido é resolvido', (select agendamento_status = 'confirmado' and reagendamento_motivo is null from public.orders where id = pg_temp.i('V1')));
select pg_temp.como('U1'); set local role authenticated;
select public.portal_responder_agendamento(pg_temp.i('V1'), 'aceitar');
reset role;
select pg_temp.reg('confirmar presença registra quando o cliente confirmou', (select agendamento_cliente_em is not null from public.orders where id = pg_temp.i('V1')) and exists (select 1 from public.order_events where order_id = pg_temp.i('V1') and event_type = 'schedule_confirmed'));

-- ---------- 5. o cliente reagenda um agendamento confirmado (limites) ----------
select pg_temp.como('U1'); set local role authenticated;
select public.portal_responder_agendamento(pg_temp.i('V1'), 'outra_data', jsonb_build_array(jsonb_build_object('data', pg_temp.dia(16), 'periodo', 'manha')), 'Imprevisto');
reset role;
select pg_temp.reg('reagendar um confirmado: pede outra data e conta 1 no limite do cliente', (select agendamento_status = 'reagendamento_pedido' and reagendamentos_cliente = 1 from public.orders where id = pg_temp.i('V1')));
update public.orders set scheduled_at = (pg_temp.dia(16) || ' 09:00-03')::timestamptz where id = pg_temp.i('V1');
select pg_temp.como('U1'); set local role authenticated;
select public.portal_responder_agendamento(pg_temp.i('V1'), 'outra_data', jsonb_build_array(jsonb_build_object('data', pg_temp.dia(18), 'periodo', 'manha')), null);
reset role;
update public.orders set scheduled_at = (pg_temp.dia(18) || ' 09:00-03')::timestamptz where id = pg_temp.i('V1');
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('3º reagendamento pelo portal → limite (2) atingido', format($q$select public.portal_responder_agendamento(%L, 'outra_data', jsonb_build_array(jsonb_build_object('data', %L, 'periodo', 'manha')))$q$, pg_temp.i('V1'), pg_temp.dia(20)), 'permitidos');
reset role;
update public.tenants set agendamento_config = agendamento_config || '{"max_reagendamentos_cliente":0,"reagendar_motivo_obrigatorio":true}'::jsonb where id = pg_temp.i('T');
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('motivo obrigatório (configurado) → recusado sem motivo', format($q$select public.portal_responder_agendamento(%L, 'outra_data', jsonb_build_array(jsonb_build_object('data', %L, 'periodo', 'manha')))$q$, pg_temp.i('V1'), pg_temp.dia(20)), 'motivo');
select public.portal_responder_agendamento(pg_temp.i('V1'), 'outra_data', jsonb_build_array(jsonb_build_object('data', pg_temp.dia(20), 'periodo', 'manha')), 'Agora com motivo');
reset role;
select pg_temp.reg('limite 0 = sem limite (o cliente reagenda de novo)', (select agendamento_status = 'reagendamento_pedido' and reagendamentos_cliente = 3 from public.orders where id = pg_temp.i('V1')));
update public.orders set scheduled_at = (pg_temp.dia(20) || ' 09:00-03')::timestamptz where id = pg_temp.i('V1');
update public.tenants set agendamento_config = agendamento_config || '{"cliente_reagenda":false}'::jsonb where id = pg_temp.i('T');
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('empresa não permite reagendar pelo portal → recusado', format($q$select public.portal_responder_agendamento(%L, 'outra_data', jsonb_build_array(jsonb_build_object('data', %L, 'periodo', 'manha')), 'x')$q$, pg_temp.i('V1'), pg_temp.dia(22)), 'não permite');
create temp table _g2 as select public.portal_obter_chamado(pg_temp.i('V1'))->'agendamento' j;
reset role;
select pg_temp.reg('a tela sabe que não pode pedir outra data nem reagendar', (select not (j->>'pode_pedir_outra')::boolean from _g2));
update public.tenants set agendamento_config = agendamento_config || '{"cliente_reagenda":true,"max_reagendamentos_cliente":5,"reagendar_antecedencia_horas":24}'::jsonb where id = pg_temp.i('T');
update public.orders set scheduled_at = now() + interval '10 hours', agendado_pelo_cliente = true where id = pg_temp.i('V1');   -- combinado = confirmado
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('perto demais da data (menos de 24 h) → recusado', format($q$select public.portal_responder_agendamento(%L, 'outra_data', jsonb_build_array(jsonb_build_object('data', %L, 'periodo', 'manha')), 'x')$q$, pg_temp.i('V1'), pg_temp.dia(8)), 'Já não dá para reagendar');
reset role;

-- ---------- 6. o cliente cancela ----------
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('cancelar perto demais da data (menos de 12 h) é recusado? aqui faltam 10 h', format('select public.portal_cancelar_agendamento(%L, %L)', pg_temp.i('V1'), 'x'), 'Já não dá para cancelar');
reset role;
update public.orders set scheduled_at = now() + interval '3 days' where id = pg_temp.i('V1');
select pg_temp.como('U3'); set local role authenticated;
select pg_temp.deve_falhar('pessoa de fora da equipe não cancela', format('select public.portal_cancelar_agendamento(%L, %L)', pg_temp.i('V1'), 'x'), 'Chamado não encontrado');
reset role;
select pg_temp.como('U1'); set local role authenticated;
select public.portal_cancelar_agendamento(pg_temp.i('V1'), 'Não precisamos mais da visita');
reset role;
select pg_temp.reg('cancelar: a OS fica cancelada com o motivo "Cancelado pelo cliente — …", evento e aviso à equipe',
  (select status = 'cancelada' and cancel_reason = 'Cancelado pelo cliente — Não precisamos mais da visita' from public.orders where id = pg_temp.i('V1'))
  and exists (select 1 from public.order_events where order_id = pg_temp.i('V1') and event_type = 'cancelled' and details->>'por' = 'cliente')
  and exists (select 1 from public.notificacoes where order_id = pg_temp.i('V1') and tipo = 'cancelamento_cliente'));
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('chamado já cancelado não cancela de novo', format('select public.portal_cancelar_agendamento(%L, %L)', pg_temp.i('V1'), 'x'), 'já começou');
reset role;
update public.tenants set agendamento_config = agendamento_config || '{"cliente_cancela":false}'::jsonb where id = pg_temp.i('T');
insert into _id values ('V2', pg_temp.visita('Visita para cancelar', jsonb_build_array(jsonb_build_object('data', pg_temp.dia(7), 'periodo', 'qualquer'))));
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('empresa não permite cancelar pelo portal → recusado', format('select public.portal_cancelar_agendamento(%L, %L)', pg_temp.i('V2'), 'x'), 'não permite');
reset role;
update public.tenants set agendamento_config = agendamento_config || '{"cliente_cancela":true}'::jsonb where id = pg_temp.i('T');
select pg_temp.como('U1'); set local role authenticated;
select public.portal_cancelar_agendamento(pg_temp.i('V2'), null);
reset role;
select pg_temp.reg('cancelar um chamado que ainda não foi agendado também vale (aberta)', (select status = 'cancelada' from public.orders where id = pg_temp.i('V2')));

-- ---------- 7. lembretes ----------
update public.tenants set agendamento_config = '{"lembretes":[{"antes_horas":48},{"antes_horas":24}]}'::jsonb where id = pg_temp.i('T');
insert into _id values ('V3', pg_temp.visita('Visita com lembrete', jsonb_build_array(jsonb_build_object('data', pg_temp.dia(6), 'periodo', 'manha'))));
update public.orders set status = 'agendada', scheduled_at = now() + interval '23 hours 30 minutes', agendado_pelo_cliente = true where id = pg_temp.i('V3');
create temp table _lm1 as select public.enviar_lembretes_agendamento() n;
select pg_temp.reg('lembrete: sai o de 24 h (a janela abriu há 30 min) e NÃO o de 48 h (já passou)',
  (select n >= 1 from _lm1) and exists (select 1 from public.portal_lembretes where order_id = pg_temp.i('V3') and antes_horas = 24)
  and not exists (select 1 from public.portal_lembretes where order_id = pg_temp.i('V3') and antes_horas = 48));
create temp table _lm2 as select public.enviar_lembretes_agendamento() n;
select pg_temp.reg('lembrete: não repete', (select count(*) = 1 from public.portal_lembretes where order_id = pg_temp.i('V3')));
update public.orders set scheduled_at = now() + interval '80 hours' where id = pg_temp.i('V3');
create temp table _lm3 as select public.enviar_lembretes_agendamento() n;
select pg_temp.reg('lembrete: longe da data não sai nada novo', (select count(*) = 1 from public.portal_lembretes where order_id = pg_temp.i('V3')));
update public.orders set scheduled_at = now() + interval '47 hours 40 minutes' where id = pg_temp.i('V3');
create temp table _lm4 as select public.enviar_lembretes_agendamento() n;
select pg_temp.reg('lembrete: remarcou a data → os lembretes valem para a data nova (o de 48 h sai)', (select count(*) = 2 from public.portal_lembretes where order_id = pg_temp.i('V3')));
update public.orders set status = 'agendada', scheduled_at = now() + interval '23 hours 30 minutes' where id = pg_temp.i('OI');
create temp table _lm5 as select public.enviar_lembretes_agendamento() n;
select pg_temp.reg('lembrete: OS aberta pela equipe (sem cliente do portal) não gera lembrete', (select not exists (select 1 from public.portal_lembretes where order_id = pg_temp.i('OI')) from _lm5));

select count(*) filter (where not ok) as falhas, count(*) as total,
       coalesce(json_agg(json_build_object('teste', teste, 'detalhe', detalhe) order by n) filter (where not ok), '[]') as detalhes
from _r;
rollback;
