-- ============================================================
-- ATOS — Roteiro de testes: transparência do prazo e "prazo explicado" no portal (E5b parte 2)
-- ============================================================
-- Desfaz tudo no fim (rollback). Saída: {"falhas": N, "total": N, "detalhes": [...]}.
-- Pré-requisitos (massa de teste do DEV): empresa Infoxtec com o portal ativo,
-- clientes "Cliente Trigger Teste" (A) e "Atakarejo" (B), a Supervisora
-- portal.teste@example.com (A), o admin adm@infoxtec.com.br, o Atendente
-- atendente.teste@infoxtec.com.br, o técnico "Infoxtec Teste".
-- IMPORTANTE (lição de 2026-10-09): nada de EXCEPTION no bloco externo; cada
-- chamada que deve falhar usa pg_temp.deve_falhar. Valide o roteiro com uma
-- falha plantada antes de confiar nele.
-- Uso: sql.sh supabase/tests/transparencia_prazo.sql
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



insert into _id select 'MA', id from public.motivos_pausa where tenant_id = pg_temp.i('T') and nome = 'Aguardando o cliente';
insert into _id select 'MI', id from public.motivos_pausa where tenant_id = pg_temp.i('T') and nome = 'Outro';

-- ---------- 1. níveis ----------
update public.tenants set sla_transparencia = 'previsao' where id = pg_temp.i('T');
update public.clients set sla_transparencia = null where id = pg_temp.i('A');
select pg_temp.como('U1'); set local role authenticated;
create temp table _t1 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('previsão (padrão): o cliente vê a previsão de atendimento e de solução, sem selo de no prazo/fora',
  (select j#>>'{prazos,nivel}' = 'previsao' and j#>>'{prazos,solucao}' is not null and j#>>'{prazos,atendimento}' is not null and j#>>'{prazos,situacao}' is null from _t1),
  (select j->>'prazos' from _t1));
update public.orders set atendido_em = now() where id = pg_temp.i('O1');
select pg_temp.como('U1'); set local role authenticated;
create temp table _t2 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('depois de iniciado o atendimento, só a previsão de solução continua', (select j#>>'{prazos,atendimento}' is null and j#>>'{prazos,solucao}' is not null from _t2));
update public.tenants set sla_transparencia = 'oculto' where id = pg_temp.i('T');
select pg_temp.como('U1'); set local role authenticated;
create temp table _t3 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('oculto: o cliente não recebe prazo nenhum', (select j->'prazos' is null or j->>'prazos' is null from _t3));
update public.tenants set sla_transparencia = 'completo' where id = pg_temp.i('T');
select pg_temp.como('U1'); set local role authenticated;
create temp table _t4 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('completo: no prazo / fora do prazo aparece ("no prazo" no chamado novo)', (select j#>>'{prazos,situacao}' = 'no_prazo' from _t4));
update public.orders set prazo_solucao = now() - interval '1 hour' where id = pg_temp.i('O1');
select pg_temp.como('U1'); set local role authenticated;
create temp table _t5 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('completo: prazo vencido aparece como "fora do prazo"', (select j#>>'{prazos,situacao}' = 'fora_do_prazo' from _t5));
update public.clients set sla_transparencia = 'oculto' where id = pg_temp.i('A');
select pg_temp.como('U1'); set local role authenticated;
create temp table _t6 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('exceção por cliente: oculto sobrepõe o padrão completo da empresa', (select j->>'prazos' is null from _t6));
update public.clients set sla_transparencia = null where id = pg_temp.i('A');
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.reg('visita: nunca mostra prazo', (select public.portal_obter_chamado(pg_temp.i('OV'))->>'prazos' is null));
reset role;

-- ---------- 2. prazo pausado e andamento explicado ----------
update public.tenants set sla_transparencia = 'previsao' where id = pg_temp.i('T');
update public.orders set sla_pausado_desde = now() where id = pg_temp.i('O1');
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.reg('prazo parado (pausa que para o SLA): o cliente vê que está pausado', (select (public.portal_obter_chamado(pg_temp.i('O1'))#>>'{prazos,pausado}')::boolean));
reset role;
update public.orders set sla_pausado_desde = null where id = pg_temp.i('O1');
insert into public.order_events (tenant_id, order_id, event_type, actor_name, details, created_at) values
  (pg_temp.i('T'), pg_temp.i('O1'), 'paused', 'Carla', jsonb_build_object('reason', 'SEGREDO-INTERNO-DA-PAUSA', 'motivo_id', pg_temp.i('MA')), now() - interval '3 hours'),
  (pg_temp.i('T'), pg_temp.i('O1'), 'resumed', 'Portal', jsonb_build_object('por', 'cliente'), now() - interval '2 hours'),
  (pg_temp.i('T'), pg_temp.i('O1'), 'paused', 'Carla', jsonb_build_object('reason', 'SEGREDO-OUTRA-PAUSA', 'motivo_id', pg_temp.i('MI')), now() - interval '90 minutes'),
  (pg_temp.i('T'), pg_temp.i('O1'), 'resumed', 'Carla', '{}'::jsonb, now() - interval '60 minutes'),
  (pg_temp.i('T'), pg_temp.i('O1'), 'scheduled', 'Carla', jsonb_build_object('scheduled_at', (now() + interval '3 days')::text, 'a_pedido_do_cliente', true, 'reagendado', true), now() - interval '30 minutes');
select pg_temp.como('U1'); set local role authenticated;
create temp table _t7 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('andamento: a pausa que aciona o cliente aparece, com o texto do motivo (não o texto interno)',
  (select exists (select 1 from jsonb_array_elements(j->'linha_do_tempo') e where e->>'evento' = 'paused' and e#>>'{detalhe,texto}' = 'Aguardando a sua resposta' and (e#>>'{detalhe,para_sla}')::boolean) from _t7));
select pg_temp.reg('andamento: pausa interna não aparece (nem a retomada dela)',
  (select (select count(*) from jsonb_array_elements(j->'linha_do_tempo') e where e->>'evento' = 'paused') = 1 and (select count(*) from jsonb_array_elements(j->'linha_do_tempo') e where e->>'evento' = 'resumed') = 1 from _t7));
select pg_temp.reg('andamento: nenhum texto interno da pausa vaza para o cliente', (select position('SEGREDO' in j::text) = 0 from _t7));
select pg_temp.reg('andamento: o agendamento a pedido do cliente chega marcado (para "prazo ajustado")',
  (select exists (select 1 from jsonb_array_elements(j->'linha_do_tempo') e where e->>'evento' = 'scheduled' and (e#>>'{detalhe,a_pedido_do_cliente}')::boolean and (e#>>'{detalhe,reagendado}')::boolean) from _t7));

-- ---------- 3. quem define ----------
select pg_temp.como('ADM'); set local role authenticated;
select public.definir_transparencia_sla('completo');
select public.definir_transparencia_sla('oculto', pg_temp.i('A'));
select pg_temp.deve_falhar('nível inventado → recusado', 'select public.definir_transparencia_sla(''secreto'')', 'Escolha');
select pg_temp.deve_falhar('nível inventado por cliente → recusado', format('select public.definir_transparencia_sla(%L, %L)', 'secreto', pg_temp.i('A')), 'Escolha');
reset role;
select pg_temp.reg('o admin define o padrão da empresa e a exceção do cliente',
  (select (select sla_transparencia from public.tenants where id = pg_temp.i('T')) = 'completo' and (select sla_transparencia from public.clients where id = pg_temp.i('A')) = 'oculto'));
select pg_temp.como('ADM'); set local role authenticated;
select public.definir_transparencia_sla(null, pg_temp.i('A'));
reset role;
select pg_temp.reg('nulo na exceção volta ao padrão da empresa', (select sla_transparencia is null from public.clients where id = pg_temp.i('A')));
select pg_temp.como('AT'); set local role authenticated;
select pg_temp.deve_falhar('atendente não define o que o cliente vê', 'select public.definir_transparencia_sla(''oculto'')', 'administrador');
reset role;
select pg_temp.como('TEC'); set local role authenticated;
select pg_temp.deve_falhar('técnico não define o que o cliente vê', 'select public.definir_transparencia_sla(''oculto'')', 'administrador');
reset role;
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('pessoa do portal não define', 'select public.definir_transparencia_sla(''completo'')', 'administrador');
reset role;

select count(*) filter (where not ok) as falhas, count(*) as total,
       coalesce(json_agg(json_build_object('teste', teste, 'detalhe', detalhe) order by n) filter (where not ok), '[]') as detalhes
from _r;
rollback;
