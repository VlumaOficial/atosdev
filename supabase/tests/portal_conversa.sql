-- ============================================================
-- ATOS — Roteiro de testes: portal — conversa com o cliente e triagem pelo N1 (E5a)
-- ============================================================
-- Desfaz tudo no fim (rollback). Saída: {"falhas": N, "total": N, "detalhes": [...]}.
-- Pré-requisitos (massa de teste do DEV): empresa Infoxtec com o portal ativo,
-- clientes "Cliente Trigger Teste" (A) e "Atakarejo" (B), a Supervisora
-- portal.teste@example.com (A), o admin adm@infoxtec.com.br, o Atendente
-- atendente.teste@infoxtec.com.br, o técnico "Infoxtec Teste".
-- IMPORTANTE (lição de 2026-10-09): nada de EXCEPTION no bloco externo; cada
-- chamada que deve falhar usa pg_temp.deve_falhar. Valide o roteiro com uma
-- falha plantada antes de confiar nele.
-- Uso: sql.sh supabase/tests/portal_conversa.sql
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

-- ---------- 1. equipe responde ao cliente / nota interna ----------
select pg_temp.como('AT'); set local role authenticated;
select public.os_comentar(pg_temp.i('O1'), 'Olá, vamos verificar a câmera hoje.', 'cliente');
select public.os_comentar(pg_temp.i('O1'), 'NOTA-INTERNA-SECRETA: cliente já teve problema igual', 'interno');
reset role;
select pg_temp.reg('equipe: "Responder ao cliente" grava com visibilidade cliente e autoria do atendente',
  (select visibilidade = 'cliente' and user_id = pg_temp.i('AT') and autor_portal_id is null from public.order_comments where comment like 'Olá, vamos verificar%'));
select pg_temp.reg('equipe: "Nota interna" grava com visibilidade interno', (select visibilidade = 'interno' from public.order_comments where comment like 'NOTA-INTERNA-SECRETA%'));
select pg_temp.reg('SLA: a 1ª resposta pública marca o respondido_em', (select respondido_em is not null from public.orders where id = pg_temp.i('O1')));
select pg_temp.como('AT'); set local role authenticated;
select pg_temp.deve_falhar('escrita direta de comentário "cliente" na tabela → recusada (só pela função)', format($q$insert into public.order_comments (tenant_id, order_id, user_id, author_name, comment, visibilidade) values (%L, %L, %L, 'x', 'forjado', 'cliente')$q$, pg_temp.i('T'), pg_temp.i('O1'), pg_temp.i('AT')), 'row-level security');
select pg_temp.deve_falhar('escrita direta forjando autoria do cliente → recusada', format($q$insert into public.order_comments (tenant_id, order_id, user_id, author_name, comment, autor_portal_id) values (%L, %L, %L, 'x', 'forjado', %L)$q$, pg_temp.i('T'), pg_temp.i('O1'), pg_temp.i('AT'), pg_temp.i('U1')), 'row-level security');
select pg_temp.deve_falhar('trocar a visibilidade de um comentário existente → recusado', format($q$update public.order_comments set visibilidade = 'cliente' where comment like 'NOTA-INTERNA-SECRETA%%' and order_id = %L$q$, pg_temp.i('O1')), 'não podem ser alteradas');
select pg_temp.deve_falhar('responder ao cliente em OS aberta pela equipe (sem solicitante) → recusado', format('select public.os_comentar(%L, %L, %L)', pg_temp.i('OI'), 'oi', 'cliente'), 'não foi aberta pelo portal');
select pg_temp.deve_falhar('comentário vazio → recusado', format('select public.os_comentar(%L, %L, %L)', pg_temp.i('O1'), '   ', 'interno'), 'Escreva');
select pg_temp.deve_falhar('resposta ao cliente com mais de 2000 letras → recusada', format('select public.os_comentar(%L, repeat(%L, 2001), %L)', pg_temp.i('O1'), 'a', 'cliente'), '2000');
select pg_temp.deve_falhar('visibilidade inventada → recusada', format('select public.os_comentar(%L, %L, %L)', pg_temp.i('O1'), 'oi', 'publico'), 'Visibilidade');
reset role;
-- técnico que NÃO é o responsável não enxerga a OS: nem responde, nem comenta
select pg_temp.como('TEC2'); set local role authenticated;
select pg_temp.deve_falhar('técnico sem acesso à OS não responde ao cliente', format('select public.os_comentar(%L, %L, %L)', pg_temp.i('O1'), 'oi', 'cliente'), 'não encontrada');
reset role;
update public.orders set technician_id = pg_temp.i('TEC') where id = pg_temp.i('O1');
select pg_temp.como('TEC'); set local role authenticated;
select public.os_comentar(pg_temp.i('O1'), 'Cheguei e vou verificar agora.', 'cliente');
reset role;
select pg_temp.reg('técnico responsável também responde ao cliente (texto)', exists (select 1 from public.order_comments where comment like 'Cheguei e vou%' and visibilidade = 'cliente' and user_id = pg_temp.i('TEC')));

-- ---------- 2. o cliente vê só a conversa pública ----------
select pg_temp.como('U1'); set local role authenticated;
create temp table _c1 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('portal: o cliente vê as respostas da empresa (com o 1º nome de quem respondeu)',
  (select exists (select 1 from jsonb_array_elements(j->'mensagens') m where m->>'autor' = 'empresa' and m->>'texto' like 'Olá, vamos%' and m->>'nome' = 'Atendente') and exists (select 1 from jsonb_array_elements(j->'mensagens') m where m->>'texto' like 'Cheguei e vou%') from _c1));
select pg_temp.reg('portal: a NOTA INTERNA nunca aparece para o cliente', (select position('NOTA-INTERNA' in j::text) = 0 and position('forjado' in j::text) = 0 from _c1));
select pg_temp.reg('portal: pode responder enquanto o chamado não está cancelado', (select (j->>'pode_responder')::boolean from _c1));
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.reg('portal: a pessoa não lê a tabela de comentários diretamente', (select count(*) = 0 from public.order_comments));
reset role;

-- ---------- 3. o cliente responde ----------
select pg_temp.como('U1'); set local role authenticated;
select public.portal_enviar_mensagem(pg_temp.i('O1'), 'Podem vir amanhã de manhã, por favor.');
reset role;
select pg_temp.reg('cliente: a mensagem é gravada com a autoria da pessoa do portal e visibilidade cliente',
  (select visibilidade = 'cliente' and autor_portal_id = pg_temp.i('U1') and user_id is null from public.order_comments where comment like 'Podem vir amanhã%'));
select pg_temp.reg('cliente: o responsável (técnico) é avisado no sino', (select count(*) = 1 from public.notificacoes where user_id = pg_temp.i('TEC') and tipo = 'mensagem_cliente' and order_id = pg_temp.i('O1')));
select pg_temp.reg('cliente: o coordenador do grupo também é avisado (quando há grupo)', true);
select pg_temp.como('U2'); set local role authenticated;
create temp table _c2 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('equipe do cliente (compartilhado): a colega vê a conversa, com o nome de quem escreveu',
  (select exists (select 1 from jsonb_array_elements(j->'mensagens') m where m->>'autor' = 'cliente' and m->>'nome' = 'Pessoa U1' and m->>'texto' like 'Podem vir%') from _c2));
select pg_temp.como('U1'); set local role authenticated;
create temp table _c3 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('o autor vê a própria mensagem como "Você"', (select exists (select 1 from jsonb_array_elements(j->'mensagens') m where m->>'autor' = 'cliente' and m->>'nome' = 'Você') from _c3));
select pg_temp.como('U3'); set local role authenticated;
select pg_temp.deve_falhar('pessoa de FORA da equipe não responde ao chamado', format('select public.portal_enviar_mensagem(%L, %L)', pg_temp.i('O1'), 'oi tudo bem'), 'Chamado não encontrado');
select pg_temp.deve_falhar('pessoa de FORA da equipe não lê a conversa', format('select public.portal_obter_chamado(%L)', pg_temp.i('O1')), 'Chamado não encontrado');
reset role;
select pg_temp.como('X'); set local role authenticated;
select pg_temp.deve_falhar('pessoa de OUTRO cliente não responde', format('select public.portal_enviar_mensagem(%L, %L)', pg_temp.i('O1'), 'oi tudo bem'), 'Chamado não encontrado');
reset role;
insert into public.portal_equipe_membros (equipe_id, user_id, tenant_id) values (pg_temp.i('E1'), pg_temp.i('Z'), pg_temp.i('T'));
select pg_temp.como('Z'); set local role authenticated;
select pg_temp.deve_falhar('sem aceitar os termos não envia mensagem (mesmo vendo o chamado)', format('select public.portal_enviar_mensagem(%L, %L)', pg_temp.i('O1'), 'oi tudo bem'), 'Aceite os termos');
reset role;
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('mensagem curta demais → recusada', format('select public.portal_enviar_mensagem(%L, %L)', pg_temp.i('O1'), 'a'), 'Escreva');
select pg_temp.deve_falhar('mensagem com mais de 2000 letras → recusada', format('select public.portal_enviar_mensagem(%L, repeat(%L, 2001))', pg_temp.i('O1'), 'a'), '2000');
select pg_temp.deve_falhar('mais de 3 arquivos → recusado', format($q$select public.portal_enviar_mensagem(%L, %L, '[{"path":"a"},{"path":"b"},{"path":"c"},{"path":"d"}]'::jsonb)$q$, pg_temp.i('O1'), 'com arquivos'), 'No máximo 3');
select pg_temp.deve_falhar('arquivo da pasta de OUTRA pessoa → recusado', format($q$select public.portal_enviar_mensagem(%L, %L, jsonb_build_array(jsonb_build_object('path', %L, 'nome', 'x.png', 'tipo', 'foto', 'mime', 'image/png', 'bytes', 100)))$q$,
  pg_temp.i('O1'), 'com arquivo alheio', pg_temp.i('T')::text || '/' || pg_temp.i('A')::text || '/' || pg_temp.i('U2')::text || '/x.png'), 'Arquivo inválido');
select pg_temp.deve_falhar('arquivo que não foi enviado → recusado', format($q$select public.portal_enviar_mensagem(%L, %L, jsonb_build_array(jsonb_build_object('path', %L, 'nome', 'x.png', 'tipo', 'foto', 'mime', 'image/png', 'bytes', 100)))$q$,
  pg_temp.i('O1'), 'com arquivo fantasma', pg_temp.i('T')::text || '/' || pg_temp.i('A')::text || '/' || pg_temp.i('U1')::text || '/fantasma.png'), 'não foi enviado');
reset role;
-- limite por hora: 20 mensagens por pessoa
insert into public.order_comments (tenant_id, order_id, author_name, comment, visibilidade, autor_portal_id)
  select pg_temp.i('T'), pg_temp.i('O1'), 'Pessoa U1', 'spam ' || g, 'cliente', pg_temp.i('U1') from generate_series(1, 19) g;
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('limite de 20 mensagens por hora por pessoa', format('select public.portal_enviar_mensagem(%L, %L)', pg_temp.i('O1'), 'mais uma mensagem'), 'Muitas mensagens');
reset role;
delete from public.order_comments where comment like 'spam %';
-- chamado cancelado não recebe mensagens
update public.orders set status = 'cancelada' where id = pg_temp.i('OV');
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('chamado cancelado não recebe mensagem do cliente', format('select public.portal_enviar_mensagem(%L, %L)', pg_temp.i('OV'), 'ainda quero'), 'cancelado');
reset role;

-- ---------- 4. triagem pelo N1 ----------
create temp table _prazo as select prazo_solucao p, priority pr from public.orders where id = pg_temp.i('O1');
select pg_temp.como('TEC'); set local role authenticated;
select pg_temp.deve_falhar('técnico não faz triagem', format('select public.os_triagem(%L, %L)', pg_temp.i('O1'), 'confirmar'), 'Sem permissão');
reset role;
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('pessoa do portal não faz triagem', format('select public.os_triagem(%L, %L)', pg_temp.i('O1'), 'confirmar'), 'Sem permissão');
reset role;
select pg_temp.como('AT'); set local role authenticated;
select pg_temp.deve_falhar('triagem em OS aberta pela equipe → recusada', format('select public.os_triagem(%L, %L)', pg_temp.i('OI'), 'confirmar'), 'portal');
select pg_temp.deve_falhar('reclassificar sem motivo → recusado', format('select public.os_triagem(%L, %L, null, null, null, %L, %L)', pg_temp.i('O1'), 'reclassificar', 'baixo', 'baixa'), 'motivo');
select pg_temp.deve_falhar('modo matriz: prioridade solta é recusada (vem do impacto e da urgência)', format('select public.os_triagem(%L, %L, %L, null, %L)', pg_temp.i('O1'), 'reclassificar', 'baixo', 'teste'), 'impacto');
select pg_temp.deve_falhar('modo matriz: só o impacto, sem a urgência → recusado', format('select public.os_triagem(%L, %L, null, null, %L, %L, null)', pg_temp.i('O1'), 'reclassificar', 'teste', 'baixo'), 'impacto');
select pg_temp.deve_falhar('impacto inventado → recusado', format('select public.os_triagem(%L, %L, null, null, %L, %L, %L)', pg_temp.i('O1'), 'reclassificar', 'teste', 'enorme', 'alta'), 'inválidos');
select pg_temp.deve_falhar('reclassificar sem mudar nada → recusado', format('select public.os_triagem(%L, %L, null, null, %L)', pg_temp.i('O1'), 'reclassificar', 'sem mudança'), 'Nada mudou');
select pg_temp.deve_falhar('reclassificar com o mesmo impacto e urgência → recusado', format('select public.os_triagem(%L, %L, null, null, %L, %L, %L)', pg_temp.i('O1'), 'reclassificar', 'sem mudança', 'alto', 'alta'), 'Nada mudou');
select pg_temp.deve_falhar('ação inventada → recusada', format('select public.os_triagem(%L, %L)', pg_temp.i('O1'), 'apagar'), 'Ação inválida');
select pg_temp.deve_falhar('visita não tem prioridade ajustável', format('select public.os_triagem(%L, %L, %L, null, %L)', pg_temp.i('OV'), 'reclassificar', 'baixo', 'teste'), 'encerrada');
reset role;
update public.orders set status = 'aberta' where id = pg_temp.i('OV');
select pg_temp.como('AT'); set local role authenticated;
select pg_temp.deve_falhar('visita: só o incidente tem prioridade ajustável', format('select public.os_triagem(%L, %L, %L, null, %L)', pg_temp.i('OV'), 'reclassificar', 'baixo', 'teste'), 'Só o incidente');
select public.os_triagem(pg_temp.i('O1'), 'reclassificar', null, pg_temp.i('CR'), 'Câmera isolada, sem impacto na operação', 'baixo', 'baixa');
reset role;
select pg_temp.reg('triagem: reclassificar muda a prioridade, guarda a informada e marca quem classificou',
  (select priority = 'baixo' and prioridade_informada = 'critico' and classificada_em is not null and classificada_por = pg_temp.i('AT') from public.orders where id = pg_temp.i('O1')),
  (select concat_ws(' | ', priority, prioridade_informada, classificada_em::text, classificada_por::text, status) from public.orders where id = pg_temp.i('O1')));
select pg_temp.reg('triagem: trocar o assunto leva a OS ao grupo padrão da nova categoria', (select categoria_id = pg_temp.i('CR') and grupo_id = pg_temp.i('G') from public.orders where id = pg_temp.i('O1')));
select pg_temp.reg('triagem: o SLA recalcula com a nova prioridade', (select prazo_solucao is distinct from (select p from _prazo) from public.orders where id = pg_temp.i('O1')),
  (select prazo_solucao::text || ' vs ' || (select p::text from _prazo) from public.orders where id = pg_temp.i('O1')));
select pg_temp.reg('triagem: o evento guarda de, para e o motivo',
  (select details->>'de' = 'critico' and details->>'para' = 'baixo' and details->>'motivo' like 'Câmera isolada%' from public.order_events where order_id = pg_temp.i('O1') and event_type = 'reclassified'));
select pg_temp.como('U1'); set local role authenticated;
create temp table _c4 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('portal: o cliente vê a reclassificação COM o motivo',
  (select exists (select 1 from jsonb_array_elements(j->'linha_do_tempo') e where e->>'evento' = 'reclassified' and e#>>'{detalhe,motivo}' like 'Câmera isolada%' and e#>>'{detalhe,de}' = 'critico' and e#>>'{detalhe,para}' = 'baixo') from _c4));
select pg_temp.como('ADM'); set local role authenticated;
select public.os_triagem(pg_temp.i('O1'), 'confirmar');
create temp table _i1 as select public.portal_info_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('equipe: "confirmar" registra a triagem (gestor/admin também podem)', (select exists (select 1 from public.order_events where order_id = pg_temp.i('O1') and event_type = 'classified')));
select pg_temp.reg('equipe: a ficha mostra a prioridade atual, a informada e o histórico de reclassificação',
  (select j->>'prioridade_atual' = 'baixo' and j->>'prioridade_informada' = 'critico' and jsonb_array_length(j->'reclassificacoes') = 1 from _i1));

-- modo SIMPLES: a prioridade é ajustada direto
update public.tenants set prioridade_modo = 'simples' where id = pg_temp.i('T');
select pg_temp.como('AT'); set local role authenticated;
select public.os_triagem(pg_temp.i('O1'), 'reclassificar', 'alto', null, 'Voltou a afetar a loja inteira');
select pg_temp.deve_falhar('modo simples: prioridade inventada → recusada', format('select public.os_triagem(%L, %L, %L, null, %L)', pg_temp.i('O1'), 'reclassificar', 'urgentissimo', 'teste'), 'inválida');
reset role;
select pg_temp.reg('modo simples: a prioridade é ajustada direto, com evento e motivo',
  (select o.priority = 'alto' and exists (select 1 from public.order_events e where e.order_id = o.id and e.event_type = 'reclassified' and e.details->>'para' = 'alto' and e.details->>'motivo' like 'Voltou%') from public.orders o where o.id = pg_temp.i('O1')),
  (select priority from public.orders where id = pg_temp.i('O1')));

select count(*) filter (where not ok) as falhas, count(*) as total,
       coalesce(json_agg(json_build_object('teste', teste, 'detalhe', detalhe) order by n) filter (where not ok), '[]') as detalhes
from _r;
rollback;
