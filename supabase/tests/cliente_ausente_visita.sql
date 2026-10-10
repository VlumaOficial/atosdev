-- ============================================================
-- ATOS — Roteiro de testes: cliente ausente, motivos de cancelamento, visita que gera chamado e nova visita (E5b parte 4)
-- ============================================================
-- Desfaz tudo no fim (rollback). Saída: {"falhas": N, "total": N, "detalhes": [...]}.
-- Pré-requisitos (massa de teste do DEV): empresa Infoxtec com o portal ativo,
-- clientes "Cliente Trigger Teste" (A) e "Atakarejo" (B), a Supervisora
-- portal.teste@example.com (A), o admin adm@infoxtec.com.br, o Atendente
-- atendente.teste@infoxtec.com.br, o técnico "Infoxtec Teste".
-- IMPORTANTE (lição de 2026-10-09): nada de EXCEPTION no bloco externo; cada
-- chamada que deve falhar usa pg_temp.deve_falhar. Valide o roteiro com uma
-- falha plantada antes de confiar nele.
-- Uso: sql.sh supabase/tests/cliente_ausente_visita.sql
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
create function pg_temp.dia(p_n int) returns text language sql stable as $$ select to_char(current_date + p_n, 'YYYY-MM-DD') $$;
create function pg_temp.visita(p_titulo text) returns uuid language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.como('U1'); set local role authenticated;
  v := public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'visita', 'categoria_id', pg_temp.i('CV'), 'titulo', p_titulo, 'descricao', 'Visita técnica para teste de cliente ausente',
        'preferencias', jsonb_build_array(jsonb_build_object('data', pg_temp.dia(6), 'periodo', 'manha'))));
  reset role;
  return (v->>'id')::uuid;
end $$;
insert into _id select 'MAUS', id from public.motivos_cancelamento where tenant_id = pg_temp.i('T') and codigo = 'ausente';
insert into _id select 'MCLI', id from public.motivos_cancelamento where tenant_id = pg_temp.i('T') and codigo = 'cliente';
insert into _id select 'MSEM', id from public.motivos_cancelamento where tenant_id = pg_temp.i('T') and nome = 'Sem acesso ao local';
insert into _id select 'MDUP', id from public.motivos_cancelamento where tenant_id = pg_temp.i('T') and nome = 'Duplicado';

-- ---------- 1. motivos de cancelamento cadastráveis ----------
select pg_temp.reg('padrões: Cancelado pelo cliente, Cliente ausente (improdutiva), Sem acesso (improdutiva), Duplicado, Outro',
  (select count(*) = 5 and count(*) filter (where improdutiva) = 2 and count(*) filter (where codigo is not null) = 2 from public.motivos_cancelamento where tenant_id = pg_temp.i('T')));
select pg_temp.como('ADM'); set local role authenticated;
insert into public.motivos_cancelamento (nome, improdutiva, ordem) values ('T7 Cliente mudou de endereço', true, 20);
reset role;
select pg_temp.reg('o admin cadastra um motivo de cancelamento novo (e marca se é visita improdutiva)', (select improdutiva and codigo is null from public.motivos_cancelamento where nome = 'T7 Cliente mudou de endereço'));
select pg_temp.como('TEC'); set local role authenticated;
select pg_temp.deve_falhar('técnico não cadastra motivo de cancelamento', $q$insert into public.motivos_cancelamento (nome) values ('T7 Indevido')$q$, 'row-level security');
reset role;
select pg_temp.como('ADM'); set local role authenticated;
select pg_temp.deve_falhar('motivo do sistema não pode ser excluído', format('delete from public.motivos_cancelamento where id = %L', pg_temp.i('MAUS')), 'sistema');
select pg_temp.deve_falhar('motivo do sistema não pode ser desativado', format('update public.motivos_cancelamento set ativo = false where id = %L', pg_temp.i('MAUS')), 'sistema');
select pg_temp.deve_falhar('"Cliente ausente" sempre conta como improdutiva', format('update public.motivos_cancelamento set improdutiva = false where id = %L', pg_temp.i('MAUS')), 'improdutiva');
select pg_temp.deve_falhar('código reservado ao sistema não pode ser dado a outro motivo', format($q$update public.motivos_cancelamento set codigo = 'ausente' where id = %L$q$, pg_temp.i('MDUP')), 'reservado');
select pg_temp.deve_falhar('nome repetido → recusado', $q$insert into public.motivos_cancelamento (nome) values ('duplicado')$q$, 'duplicate');
reset role;

-- ---------- 2. cancelar com motivo ----------
update public.orders set status = 'cancelada', cancel_motivo_id = pg_temp.i('MSEM'), cancel_reason = 'Sem acesso ao local' where id = pg_temp.i('OI');
select pg_temp.reg('cancelar com motivo "improdutivo" marca a visita como improdutiva', (select improdutiva and cliente_ausente_em is null from public.orders where id = pg_temp.i('OI')));
insert into public.orders (tenant_id, client_id, title, tipo, priority, created_by) values (pg_temp.i('T'), pg_temp.i('A'), 'T7 OS para duplicado', 'incidente', 'baixo', pg_temp.i('ADM'));
insert into _id select 'OD', id from public.orders where title = 'T7 OS para duplicado';
update public.orders set status = 'cancelada', cancel_motivo_id = pg_temp.i('MDUP') where id = pg_temp.i('OD');
select pg_temp.reg('cancelar com motivo comum NÃO é improdutivo', (select not improdutiva from public.orders where id = pg_temp.i('OD')));
insert into public.orders (tenant_id, client_id, title, tipo, priority, created_by) values (pg_temp.i('T'), pg_temp.i('A'), 'T7 OS motivo de outra empresa', 'incidente', 'baixo', pg_temp.i('ADM'));
insert into _id select 'OX', id from public.orders where title = 'T7 OS motivo de outra empresa';
select pg_temp.deve_falhar('motivo de OUTRA empresa → recusado', format('update public.orders set status = %L, cancel_motivo_id = (select id from public.motivos_cancelamento where tenant_id <> %L limit 1) where id = %L', 'cancelada', pg_temp.i('T'), pg_temp.i('OX')), 'inválido');

-- ---------- 3. cliente ausente: o cliente vê o motivo e pede nova visita ----------
insert into _id values ('V1', pg_temp.visita('Visita do cliente ausente'));
update public.orders set status = 'agendada', scheduled_at = (pg_temp.dia(7) || ' 09:00-03')::timestamptz where id = pg_temp.i('V1');
update public.orders set status = 'cancelada', cancel_motivo_id = pg_temp.i('MAUS'), cancel_reason = 'Cliente ausente' where id = pg_temp.i('V1');
select pg_temp.reg('cliente ausente: registra a hora e marca como visita improdutiva', (select improdutiva and cliente_ausente_em is not null from public.orders where id = pg_temp.i('V1')));
select pg_temp.como('U1'); set local role authenticated;
create temp table _c1 as select public.portal_obter_chamado(pg_temp.i('V1'))->'cancelamento' j;
reset role;
select pg_temp.reg('portal: "Visita não realizada: cliente ausente" e pode pedir nova visita',
  (select j->>'texto' = 'Visita não realizada: cliente ausente' and (j->>'ausente')::boolean and (j->>'pode_pedir_nova_visita')::boolean from _c1), (select j::text from _c1));
select pg_temp.como('U1'); set local role authenticated;
create temp table _c2 as select public.portal_obter_chamado(pg_temp.i('OD'))->'cancelamento' j;
reset role;
select pg_temp.reg('portal: cancelamento comum não mostra bloco de visita não realizada', (select j is null or j::text = 'null' from _c2));

select pg_temp.como('U3'); set local role authenticated;
select pg_temp.deve_falhar('pessoa de fora da equipe não pede nova visita', format($q$select public.portal_pedir_nova_visita(%L, jsonb_build_array(jsonb_build_object('data', %L, 'periodo', 'manha')))$q$, pg_temp.i('V1'), pg_temp.dia(8)), 'Chamado não encontrado');
reset role;
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('nova visita sem data → recusada', format($q$select public.portal_pedir_nova_visita(%L, '[]'::jsonb)$q$, pg_temp.i('V1')), 'pelo menos uma');
select pg_temp.deve_falhar('nova visita com data antes da antecedência → recusada', format($q$select public.portal_pedir_nova_visita(%L, jsonb_build_array(jsonb_build_object('data', %L, 'periodo', 'manha')))$q$, pg_temp.i('V1'), pg_temp.dia(0)), 'a partir de');
select pg_temp.deve_falhar('nova visita de um cancelamento comum → recusada', format($q$select public.portal_pedir_nova_visita(%L, jsonb_build_array(jsonb_build_object('data', %L, 'periodo', 'manha')))$q$, pg_temp.i('OD'), pg_temp.dia(8)), 'não foi realizada');
create temp table _n1 as select public.portal_pedir_nova_visita(pg_temp.i('V1'), jsonb_build_array(jsonb_build_object('data', pg_temp.dia(8), 'periodo', 'tarde')), 'Agora tem alguém na portaria') j;
reset role;
insert into _id select 'V2', (j->>'id')::uuid from _n1;
select pg_temp.reg('nova visita: cria uma Visita do portal, ligada à anterior, com as datas pedidas e o solicitante certo',
  (select tipo = 'visita' and origem = 'portal' and relacionada_a = pg_temp.i('V1') and solicitante_id = pg_temp.i('U1') and preferencia_agendamento->0->>'data' = pg_temp.dia(8) and description like '%portaria%' from public.orders where id = pg_temp.i('V2')));
select pg_temp.reg('nova visita: o responsável é avisado no sino', (select exists (select 1 from public.notificacoes where order_id = pg_temp.i('V2') and tipo = 'novo_chamado_portal')));
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('já existe uma nova visita em andamento → não pede outra', format($q$select public.portal_pedir_nova_visita(%L, jsonb_build_array(jsonb_build_object('data', %L, 'periodo', 'manha')))$q$, pg_temp.i('V1'), pg_temp.dia(9)), 'em andamento');
create temp table _r1 as select public.portal_obter_chamado(pg_temp.i('V2')) j;
create temp table _r2 as select public.portal_obter_chamado(pg_temp.i('V1')) j;
reset role;
select pg_temp.reg('portal: a nova visita mostra "relacionada a" e a antiga lista a derivada',
  (select j#>>'{relacionada,numero}' is not null from _r1) and (select exists (select 1 from jsonb_array_elements(j->'derivados') d where (d->>'id')::uuid = pg_temp.i('V2')) and not (j#>>'{cancelamento,pode_pedir_nova_visita}')::boolean from _r2));

-- ---------- 4. visita gera chamado ----------
update public.orders set status = 'em_andamento', technician_id = pg_temp.i('TEC') where id = pg_temp.i('OV');
select pg_temp.como('AT'); set local role authenticated;
select pg_temp.deve_falhar('só uma Visita gera chamado (incidente não)', format('select public.os_gerar_chamado(%L, %L, %L, %L)', pg_temp.i('O1'), 'incidente', 'Título válido', 'Descrição com mais de dez letras'), 'Só uma Visita');
select pg_temp.deve_falhar('tipo do chamado gerado precisa ser incidente ou requisição', format('select public.os_gerar_chamado(%L, %L, %L, %L)', pg_temp.i('OV'), 'visita', 'Título válido', 'Descrição com mais de dez letras'), 'Incidente ou Requisição');
select pg_temp.deve_falhar('título curto → recusado', format('select public.os_gerar_chamado(%L, %L, %L, %L)', pg_temp.i('OV'), 'incidente', 'ab', 'Descrição com mais de dez letras'), 'título');
select pg_temp.deve_falhar('descrição curta → recusada', format('select public.os_gerar_chamado(%L, %L, %L, %L)', pg_temp.i('OV'), 'incidente', 'Título válido', 'curta'), 'Descreva');
select pg_temp.deve_falhar('assunto inválido → recusado', format('select public.os_gerar_chamado(%L, %L, %L, %L, %L)', pg_temp.i('OV'), 'incidente', 'Título válido', 'Descrição com mais de dez letras', gen_random_uuid()), 'Assunto inválido');
create temp table _g1 as select public.os_gerar_chamado(pg_temp.i('OV'), 'incidente', 'Câmera da entrada com defeito', 'Na vistoria encontramos a câmera da entrada sem imagem', pg_temp.i('CV')) j;
create temp table _g2 as select public.os_gerar_chamado(pg_temp.i('OV'), 'requisicao', 'Trocar o gravador', 'Gravador antigo precisa ser trocado conforme vistoria') j;
reset role;
insert into _id select 'G1', (j->>'id')::uuid from _g1; insert into _id select 'G2', (j->>'id')::uuid from _g2;
select pg_temp.reg('visita gera Incidente ligado: herda cliente, unidade e solicitante, entra na triagem (sem classificação)',
  (select tipo = 'incidente' and relacionada_a = pg_temp.i('OV') and client_id = pg_temp.i('A') and solicitante_id = pg_temp.i('U1') and origem = 'portal' and classificada_em is null and categoria_id = pg_temp.i('CV') and created_by = pg_temp.i('AT') from public.orders where id = pg_temp.i('G1')));
select pg_temp.reg('visita gera Requisição ligada', (select tipo = 'requisicao' and relacionada_a = pg_temp.i('OV') from public.orders where id = pg_temp.i('G2')));
select pg_temp.reg('o evento "chamado gerado" fica na visita', (select count(*) = 2 from public.order_events where order_id = pg_temp.i('OV') and event_type = 'chamado_gerado'));
select pg_temp.como('U1'); set local role authenticated;
create temp table _p1 as select public.portal_obter_chamado(pg_temp.i('OV')) j;
create temp table _p2 as select public.portal_obter_chamado(pg_temp.i('G1')) j;
reset role;
select pg_temp.reg('portal: o cliente vê os chamados gerados pela visita e o vínculo de volta',
  (select jsonb_array_length(j->'derivados') = 2 from _p1) and (select j#>>'{relacionada,id}' = pg_temp.i('OV')::text from _p2));
select pg_temp.como('TEC2'); set local role authenticated;
select pg_temp.deve_falhar('técnico sem acesso à visita não gera chamado', format('select public.os_gerar_chamado(%L, %L, %L, %L)', pg_temp.i('OV'), 'incidente', 'Título válido', 'Descrição com mais de dez letras'), 'não encontrada');
reset role;
select pg_temp.como('TEC'); set local role authenticated;
select public.os_gerar_chamado(pg_temp.i('OV'), 'incidente', 'Outro defeito achado', 'O técnico responsável também pode gerar o chamado');
reset role;
select pg_temp.reg('o técnico responsável também gera chamado a partir da visita', (select count(*) = 3 from public.orders where relacionada_a = pg_temp.i('OV')));
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('pessoa do portal não gera chamado pela equipe', format('select public.os_gerar_chamado(%L, %L, %L, %L)', pg_temp.i('OV'), 'incidente', 'Título válido', 'Descrição com mais de dez letras'), 'não encontrada');
reset role;

-- ---------- 5. cancelar pelo portal grava o motivo do sistema ----------
insert into _id values ('V3', pg_temp.visita('Visita cancelada pelo cliente'));
select pg_temp.como('U1'); set local role authenticated;
select public.portal_cancelar_agendamento(pg_temp.i('V3'), 'Não precisamos');
reset role;
select pg_temp.reg('cancelar pelo portal usa o motivo "Cancelado pelo cliente" e não é improdutiva',
  (select cancel_motivo_id = pg_temp.i('MCLI') and not improdutiva from public.orders where id = pg_temp.i('V3')));

select count(*) filter (where not ok) as falhas, count(*) as total,
       coalesce(json_agg(json_build_object('teste', teste, 'detalhe', detalhe) order by n) filter (where not ok), '[]') as detalhes
from _r;
rollback;
