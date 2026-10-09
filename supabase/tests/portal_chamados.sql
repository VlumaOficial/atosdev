-- ============================================================
-- ATOS — Roteiro de testes: portal — abrir e acompanhar chamado (E4)
-- ============================================================
-- Desfaz tudo no fim (rollback). Saída: {"falhas": N, "total": N, "detalhes": [...]}.
-- Pré-requisitos (massa de teste do DEV): empresa Infoxtec com o portal ativo,
-- clientes "Cliente Trigger Teste" (A) e "Atakarejo" (B), a Supervisora
-- portal.teste@example.com (A), o admin adm@infoxtec.com.br, o Atendente
-- atendente.teste@infoxtec.com.br, o técnico "Infoxtec Teste".
-- IMPORTANTE (lição de 2026-10-09): nada de EXCEPTION no bloco externo; cada
-- chamada que deve falhar usa pg_temp.deve_falhar. Valide o roteiro com uma
-- falha plantada antes de confiar nele.
-- Uso: sql.sh supabase/tests/portal_chamados.sql
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
  foreach k in array array['U1', 'U2', 'U3', 'X'] loop
    u := gen_random_uuid();
    insert into auth.users (id, email, aud, role, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
    values (u, lower(k) || '.e4@example.com', 'authenticated', 'authenticated', '{"tipo":"portal"}', now(), now(), now());
    insert into public.portal_pessoas (user_id, nome, email, celular) values (u, 'Pessoa ' || k, lower(k) || '.e4@example.com', '71977776666');
    insert into _id values (k, u);
  end loop;
end $$;
insert into public.portal_vinculos (user_id, tenant_id, client_id, perfil) values
  (pg_temp.i('U1'), pg_temp.i('T'), pg_temp.i('A'), 'usuario'), (pg_temp.i('U2'), pg_temp.i('T'), pg_temp.i('A'), 'usuario'),
  (pg_temp.i('U3'), pg_temp.i('T'), pg_temp.i('A'), 'usuario'), (pg_temp.i('X'), pg_temp.i('T'), pg_temp.i('B'), 'supervisor');
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

-- ---------- 1. o que a tela de abertura enxerga ----------
select pg_temp.como('U1'); set local role authenticated;
create temp table _cfg as select public.portal_abertura_config(pg_temp.i('A')) j;
reset role;
select pg_temp.reg('config: só categorias VISÍVEIS no portal', (select not exists (select 1 from jsonb_array_elements(j->'categorias') c where c->>'nome' in ('T4 Oculta', 'T4 Filha de oculta')) from _cfg)
                   and (select exists (select 1 from jsonb_array_elements(j->'categorias') c where c->>'nome' = 'T4 Visivel') from _cfg));
select pg_temp.reg('config: subcategoria de pai oculto NÃO aparece; de pai visível aparece',
  (select not exists (select 1 from jsonb_array_elements(j->'categorias') c where c->>'nome' = 'T4 Filha de oculta') and exists (select 1 from jsonb_array_elements(j->'categorias') c where c->>'nome' = 'T4 Filha de visivel') from _cfg));
select pg_temp.reg('config: os 4 tipos aparecem em linguagem do cliente (só os com categoria visível)',
  (select exists (select 1 from jsonb_array_elements(j->'tipos') t where t->>'value' = 'incidente' and t->>'rotulo' = 'Relatar um problema') and exists (select 1 from jsonb_array_elements(j->'tipos') t where t->>'value' = 'visita') and not exists (select 1 from jsonb_array_elements(j->'tipos') t where t->>'value' = 'preventiva') from _cfg));
select pg_temp.reg('config: unidades só do cliente da pessoa', (select jsonb_array_length(j->'unidades') >= 1 and not exists (select 1 from jsonb_array_elements(j->'unidades') u where (u->>'id')::uuid = pg_temp.i('LB')) from _cfg));
select pg_temp.reg('config: a pessoa vê a(s) equipe(s) dela', (select exists (select 1 from jsonb_array_elements(j->'equipes') e where e->>'nome' = 'Equipe E1') from _cfg));
select pg_temp.como('X'); set local role authenticated;
select pg_temp.deve_falhar('config de outro cliente → sem acesso', format('select public.portal_abertura_config(%L)', pg_temp.i('A')), 'Sem acesso');
reset role;

-- ---------- 2. abrir chamado ----------
select pg_temp.como('U1'); set local role authenticated;
create temp table _a1 as select public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'incidente', 'categoria_id', pg_temp.i('CV'),
  'location_id', pg_temp.i('LA'), 'titulo', 'Câmera sem imagem', 'descricao', 'A câmera da entrada parou de gravar desde ontem', 'impacto', 'alto', 'urgencia', 'alta')) j;
reset role;
insert into _id select 'O1', (j->>'id')::uuid from _a1;
select pg_temp.reg('abrir: cria a OS com origem portal, status aberta, sem técnico',
  (select origem = 'portal' and status = 'aberta' and technician_id is null and solicitante_id = pg_temp.i('U1') and client_id = pg_temp.i('A') from public.orders where id = pg_temp.i('O1')));
select pg_temp.reg('abrir: prioridade pela matriz (alto × alta = crítico); a informada fica guardada',
  (select priority = 'critico' and prioridade_informada = 'critico' from public.orders where id = pg_temp.i('O1')));
select pg_temp.reg('abrir: a única equipe da pessoa é usada e o chamado nasce compartilhado',
  (select equipe_id = pg_temp.i('E1') and compartilhado_equipe from public.orders where id = pg_temp.i('O1')));
select pg_temp.reg('abrir: devolve número e status na língua do cliente', (select j->>'numero' like 'OS-%' and j->>'status' = 'recebido' from _a1));
select pg_temp.reg('abrir: evento "created" com origem portal na linha do tempo interna',
  (select count(*) = 1 from public.order_events where order_id = pg_temp.i('O1') and event_type = 'created' and details->>'origem' = 'portal'));
select pg_temp.reg('abrir: a entrada do atendimento é avisada (admin, gestor e atendente)',
  (select count(*) >= 1 from public.notificacoes where order_id = pg_temp.i('O1') and tipo = 'novo_chamado_portal' and user_id = pg_temp.i('ADM'))
  and (select count(*) >= 1 from public.notificacoes where order_id = pg_temp.i('O1') and tipo = 'novo_chamado_portal' and user_id = pg_temp.i('AT')));

select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('abrir com categoria oculta → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','Teste','descricao','Descrição com mais de dez letras','impacto','alto','urgencia','alta'))$q$, pg_temp.i('A'), pg_temp.i('CO')), 'assunto');
select pg_temp.deve_falhar('abrir com subcategoria de pai oculto → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','Teste','descricao','Descrição com mais de dez letras','impacto','alto','urgencia','alta'))$q$, pg_temp.i('A'), pg_temp.i('CF')), 'assunto');
select pg_temp.deve_falhar('abrir em tipo que a categoria não atende (requisição) → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','requisicao','categoria_id',%L,'titulo','Teste','descricao','Descrição com mais de dez letras'))$q$, pg_temp.i('A'), pg_temp.i('CV')), 'assunto');
select pg_temp.deve_falhar('abrir com unidade de OUTRO cliente → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'location_id',%L,'titulo','Teste','descricao','Descrição com mais de dez letras','impacto','alto','urgencia','alta'))$q$, pg_temp.i('A'), pg_temp.i('CV'), pg_temp.i('LB')), 'Unidade');
select pg_temp.deve_falhar('abrir em OUTRO cliente (sem vínculo) → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','Teste','descricao','Descrição com mais de dez letras','impacto','alto','urgencia','alta'))$q$, pg_temp.i('B'), pg_temp.i('CV')), 'Sem acesso');
select pg_temp.deve_falhar('incidente sem responder as perguntas de prioridade → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','Teste','descricao','Descrição com mais de dez letras'))$q$, pg_temp.i('A'), pg_temp.i('CV')), 'perguntas');
select pg_temp.deve_falhar('título curto demais → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','ab','descricao','Descrição com mais de dez letras','impacto','alto','urgencia','alta'))$q$, pg_temp.i('A'), pg_temp.i('CV')), 'título');
reset role;

-- ---------- 3. quem enxerga o chamado ----------
create function pg_temp.ve(p_pessoa text, p_order text) returns boolean language plpgsql as $$
declare r boolean;
begin perform pg_temp.como(p_pessoa); r := public.portal_pode_ver_chamado(pg_temp.i(p_order)); return r; end $$;
set local role authenticated;
select pg_temp.reg('visibilidade: o solicitante vê o próprio chamado', pg_temp.ve('U1', 'O1'));
select pg_temp.reg('visibilidade: colega da MESMA equipe vê (chamado compartilhado)', pg_temp.ve('U2', 'O1'));
select pg_temp.reg('visibilidade: quem não é da equipe NÃO vê', not pg_temp.ve('U3', 'O1'));
select pg_temp.reg('visibilidade: o Supervisor do cliente vê todos', pg_temp.ve('S', 'O1'));
select pg_temp.reg('visibilidade: Supervisor de OUTRO cliente NÃO vê', not pg_temp.ve('X', 'O1'));
reset role;
update public.orders set compartilhado_equipe = false where id = pg_temp.i('O1');
set local role authenticated;
select pg_temp.reg('visibilidade: com "compartilhar" desligado, só o solicitante e o Supervisor', pg_temp.ve('U1', 'O1') and not pg_temp.ve('U2', 'O1') and pg_temp.ve('S', 'O1'));
reset role;
update public.orders set compartilhado_equipe = true where id = pg_temp.i('O1');

-- a pessoa do portal não lê a tabela de OS diretamente
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.reg('isolamento: pessoa do portal não lê a tabela orders', (select count(*) = 0 from public.orders));
select pg_temp.reg('isolamento: nem os anexos nem as atualizações', (select count(*) = 0 from public.os_anexos_cliente) and (select count(*) = 0 from public.order_events));
reset role;

-- ---------- 4. listar e abrir o chamado ----------
select pg_temp.como('U1'); set local role authenticated;
create temp table _l as select public.portal_listar_chamados(pg_temp.i('T'), 'abertos', null, 1, 20) j;
create temp table _o as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('listar: traz o chamado do solicitante, com contagens', (select (j->'contagens'->>'abertos')::int >= 1 and exists (select 1 from jsonb_array_elements(j->'itens') i where (i->>'id')::uuid = pg_temp.i('O1') and i->>'status' = 'recebido' and (i->>'meu')::boolean) from _l));
select pg_temp.como('U3'); set local role authenticated;
select pg_temp.reg('listar: quem não vê o chamado não o encontra', (select not exists (select 1 from jsonb_array_elements(public.portal_listar_chamados(pg_temp.i('T'), 'todos', null, 1, 50)->'itens') i where (i->>'id')::uuid = pg_temp.i('O1'))));
reset role;
select pg_temp.reg('obter: só campos seguros (sem notas internas, sem e-mail/celular de ninguém)',
  (select not (j::text ilike '%u1.e4@%') and not (j::text like '%71977776666%') and not (j::text ilike '%celular%') and not (j ? 'internal_notes') and j->>'titulo' = 'Câmera sem imagem' from _o));
select pg_temp.reg('obter: linha do tempo só com marcos do cliente', (select not exists (select 1 from jsonb_array_elements(j->'linha_do_tempo') e where e->>'evento' in ('transferred', 'edited', 'paused', 'report_sent', 'signed')) from _o));
-- status na língua do cliente
update public.orders set status = 'em_andamento', technician_id = pg_temp.i('TEC') where id = pg_temp.i('O1');
select pg_temp.como('U1'); set local role authenticated;
create temp table _o2 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('status: em andamento → "em_atendimento", com o nome do técnico (só o nome)', (select j->>'status' = 'em_atendimento' and j->>'tecnico' = 'Infoxtec Teste' and not (j::text ilike '%u1.e4@%') from _o2));
update public.orders set status = 'pausada' where id = pg_temp.i('O1');
select pg_temp.reg('status: pausada também aparece como "em_atendimento" (a matriz de pausa é da E5)', (select public.portal_status_cliente('pausada') = 'em_atendimento'));
update public.orders set status = 'aberta', technician_id = null where id = pg_temp.i('O1');

-- ---------- 5. duplicados e "também me afeta" ----------
select pg_temp.como('U3'); set local role authenticated;
create temp table _p as select public.portal_chamados_parecidos(pg_temp.i('A'), pg_temp.i('LA'), pg_temp.i('CV')) j;
reset role;
select pg_temp.reg('parecidos: mostra o chamado aberto da mesma unidade e assunto (sem nome de quem abriu)',
  (select exists (select 1 from jsonb_array_elements(j) x where (x->>'id')::uuid = pg_temp.i('O1') and not (x->>'meu')::boolean) and not (j::text ilike '%Pessoa U1%') from _p));
select pg_temp.como('U3'); set local role authenticated;
select public.portal_tambem_afeta(pg_temp.i('O1')); select public.portal_tambem_afeta(pg_temp.i('O1'));   -- idempotente
select pg_temp.reg('também me afeta: passa a ver e acompanhar o chamado; a contagem sobe só uma vez', pg_temp.ve('U3', 'O1') and (public.portal_obter_chamado(pg_temp.i('O1'))->>'afetados')::int = 2);
reset role;
select pg_temp.como('X'); set local role authenticated;
select pg_temp.deve_falhar('também me afeta sem vínculo com o cliente → recusado', format('select public.portal_tambem_afeta(%L)', pg_temp.i('O1')), 'não encontrado');
reset role;

-- ---------- 6. preferência de data e calendário ----------
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('data no passado → recusada', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','visita','categoria_id',%L,'titulo','Visita teste','descricao','Preciso de uma visita técnica','preferencias','[{"data":"2020-01-01","periodo":"manha"}]'::jsonb))$q$, pg_temp.i('A'), pg_temp.i('CV')), 'futuras');
select pg_temp.deve_falhar('mais de 3 opções de data → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','visita','categoria_id',%L,'titulo','Visita teste','descricao','Preciso de uma visita técnica','preferencias',jsonb_build_array(jsonb_build_object('data',current_date+3),jsonb_build_object('data',current_date+4),jsonb_build_object('data',current_date+5),jsonb_build_object('data',current_date+6))))$q$, pg_temp.i('A'), pg_temp.i('CV')), 'no máximo 3');
create temp table _v as select public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'visita', 'categoria_id', pg_temp.i('CV'), 'location_id', pg_temp.i('LA'),
  'titulo', 'Visita de avaliação', 'descricao', 'Preciso de uma visita técnica para avaliar', 'preferencias', jsonb_build_array(jsonb_build_object('data', current_date + 10, 'periodo', 'manha'), jsonb_build_object('data', current_date + 11, 'periodo', 'tarde')))) j;
reset role;
insert into _id select 'OV', (j->>'id')::uuid from _v;
select pg_temp.reg('visita: guarda as 2 preferências de data; prioridade da visita é a do tipo (sem SLA)',
  (select jsonb_array_length(preferencia_agendamento) = 2 and priority = 'visita' and prioridade_informada is null from public.orders where id = pg_temp.i('OV')));
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.reg('calendário: data passada → "A data precisa ser futura."', public.portal_avisos_data(pg_temp.i('A'), pg_temp.i('LA'), current_date - 1) = 'A data precisa ser futura.');
select pg_temp.reg('calendário: um domingo futuro devolve aviso de dia sem expediente',
  (select public.portal_avisos_data(pg_temp.i('A'), pg_temp.i('LA'), d) is not null from (select (current_date + ((7 - extract(dow from current_date)::int) % 7 + 7))::date d) x));
reset role;
-- incidente descarta preferência de data
select pg_temp.como('U1'); set local role authenticated;
create temp table _i2 as select public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'incidente', 'categoria_id', pg_temp.i('CV'), 'titulo', 'Incidente com data', 'descricao', 'Algo parou de funcionar aqui', 'impacto', 'baixo', 'urgencia', 'baixa',
  'preferencias', jsonb_build_array(jsonb_build_object('data', current_date + 3)))) j;
reset role;
select pg_temp.reg('incidente ignora preferência de data (só visita/solicitação/preventiva)', (select preferencia_agendamento is null from public.orders where id = (select (j->>'id')::uuid from _i2)));

-- ---------- 7. anexos ----------
insert into storage.objects (bucket_id, name, owner, metadata) values
  ('portal-anexos', pg_temp.i('T')::text || '/' || pg_temp.i('A')::text || '/' || pg_temp.i('U1')::text || '/foto1.jpg', null, '{"mimetype":"image/jpeg","size":1000}');
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('anexo fora da própria pasta → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','Com anexo','descricao','Descrição com mais de dez letras','impacto','baixo','urgencia','baixa','anexos',jsonb_build_array(jsonb_build_object('path',%L,'nome','x.jpg','tipo','foto','mime','image/jpeg','bytes',100))))$q$, pg_temp.i('A'), pg_temp.i('CV'), pg_temp.i('T')::text || '/' || pg_temp.i('A')::text || '/' || pg_temp.i('U2')::text || '/x.jpg'), 'Arquivo inválido');
select pg_temp.deve_falhar('anexo que não foi enviado de verdade → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','Com anexo','descricao','Descrição com mais de dez letras','impacto','baixo','urgencia','baixa','anexos',jsonb_build_array(jsonb_build_object('path',%L,'nome','x.jpg','tipo','foto','mime','image/jpeg','bytes',100))))$q$, pg_temp.i('A'), pg_temp.i('CV'), pg_temp.i('T')::text || '/' || pg_temp.i('A')::text || '/' || pg_temp.i('U1')::text || '/naoexiste.jpg'), 'não foi enviado');
select pg_temp.deve_falhar('mais de 5 anexos → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','Com anexo','descricao','Descrição com mais de dez letras','impacto','baixo','urgencia','baixa','anexos',(select jsonb_agg(jsonb_build_object('path','a','nome','x','tipo','foto','mime','image/jpeg','bytes',1)) from generate_series(1,6))))$q$, pg_temp.i('A'), pg_temp.i('CV')), 'no máximo 5');
create temp table _an as select public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'incidente', 'categoria_id', pg_temp.i('CV'), 'titulo', 'Com foto', 'descricao', 'Descrição com mais de dez letras', 'impacto', 'baixo', 'urgencia', 'baixa',
  'anexos', jsonb_build_array(jsonb_build_object('path', pg_temp.i('T')::text || '/' || pg_temp.i('A')::text || '/' || pg_temp.i('U1')::text || '/foto1.jpg', 'nome', 'foto1.jpg', 'tipo', 'foto', 'mime', 'image/jpeg', 'bytes', 1000)))) j;
reset role;
insert into _id select 'OA', (j->>'id')::uuid from _an;
select pg_temp.reg('anexo válido fica ligado ao chamado', (select count(*) = 1 from public.os_anexos_cliente where order_id = pg_temp.i('OA')));
create function pg_temp.le_anexo(p_pessoa text) returns boolean language plpgsql as $$
declare r boolean;
begin perform pg_temp.como(p_pessoa); r := exists (select 1 from storage.objects where bucket_id = 'portal-anexos' and name like pg_temp.i('T')::text || '/' || pg_temp.i('A')::text || '/' || pg_temp.i('U1')::text || '/foto1.jpg'); return r; end $$;
set local role authenticated;
select pg_temp.reg('storage: o dono lê o próprio anexo', pg_temp.le_anexo('U1'));
select pg_temp.reg('storage: o Supervisor do cliente lê (vê o chamado)', pg_temp.le_anexo('S'));
select pg_temp.reg('storage: colega da equipe lê (chamado compartilhado)', pg_temp.le_anexo('U2'));
select pg_temp.reg('storage: quem não vê o chamado NÃO lê', not pg_temp.le_anexo('U3'));
select pg_temp.reg('storage: Supervisor de outro cliente NÃO lê', not pg_temp.le_anexo('X'));
reset role;
select pg_temp.como('ADM'); set local role authenticated;
select pg_temp.reg('storage: a equipe interna lê o anexo do cliente', exists (select 1 from storage.objects where bucket_id = 'portal-anexos' and name like '%/foto1.jpg'));
reset role;
select pg_temp.como('U3'); set local role authenticated;
select pg_temp.deve_falhar('storage: enviar na pasta de OUTRA pessoa → recusado', format($q$insert into storage.objects (bucket_id, name) values ('portal-anexos', %L)$q$, pg_temp.i('T')::text || '/' || pg_temp.i('A')::text || '/' || pg_temp.i('U1')::text || '/invasao.jpg'), 'row-level security');
select pg_temp.deve_falhar('storage: enviar em cliente sem vínculo → recusado', format($q$insert into storage.objects (bucket_id, name) values ('portal-anexos', %L)$q$, pg_temp.i('T')::text || '/' || pg_temp.i('B')::text || '/' || pg_temp.i('U3')::text || '/x.jpg'), 'row-level security');
select pg_temp.reg('storage: enviar na própria pasta é permitido', pg_temp.tenta(format($q$insert into storage.objects (bucket_id, name) values ('portal-anexos', %L)$q$, pg_temp.i('T')::text || '/' || pg_temp.i('A')::text || '/' || pg_temp.i('U3')::text || '/ok.jpg')) is null);
reset role;

-- ---------- 8. limite de abertura ----------
select pg_temp.como('U2'); set local role authenticated;
do $$ begin for i in 1..10 loop
  perform public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'incidente', 'categoria_id', pg_temp.i('CV'), 'titulo', 'Lote ' || i, 'descricao', 'Descrição com mais de dez letras', 'impacto', 'baixo', 'urgencia', 'baixa'));
end loop; end $$;
select pg_temp.deve_falhar('limite: o 11º chamado na mesma hora → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','Onze','descricao','Descrição com mais de dez letras','impacto','baixo','urgencia','baixa'))$q$, pg_temp.i('A'), pg_temp.i('CV')), 'Muitos chamados');
reset role;

-- ---------- 9. equipe interna ----------
select pg_temp.como('AT'); set local role authenticated;
create temp table _ia as select public.portal_info_chamado(pg_temp.i('OA')) j;
reset role;
select pg_temp.reg('interno: o Atendente vê solicitante (com e-mail e celular), equipe e anexos', (select j->'solicitante'->>'nome' = 'Pessoa U1' and j->'solicitante'->>'email' is not null and jsonb_array_length(j->'anexos') = 1 from _ia));
update public.orders set technician_id = pg_temp.i('TEC') where id = pg_temp.i('OA');
select pg_temp.como('TEC'); set local role authenticated;
create temp table _it as select public.portal_info_chamado(pg_temp.i('OA')) j;
reset role;
select pg_temp.reg('interno: o técnico responsável vê só o NOME do solicitante (sem e-mail/celular)', (select j->'solicitante'->>'nome' = 'Pessoa U1' and j->'solicitante'->>'email' is null and j->'solicitante'->>'celular' is null from _it));
select pg_temp.como('TEC2'); set local role authenticated;
select pg_temp.deve_falhar('interno: técnico de OUTRA OS não vê as informações', format('select public.portal_info_chamado(%L)', pg_temp.i('OA')), 'não encontrada');
reset role;
select pg_temp.como('TEC'); set local role authenticated;
select pg_temp.reg('storage: o técnico responsável lê o anexo do cliente', exists (select 1 from storage.objects where bucket_id = 'portal-anexos' and name like '%/foto1.jpg'));
reset role;
select pg_temp.como('TEC2'); set local role authenticated;
select pg_temp.reg('storage: técnico de outra OS NÃO lê', not exists (select 1 from storage.objects where bucket_id = 'portal-anexos' and name like '%/foto1.jpg'));
reset role;

-- ---------- 10. configuração da empresa ----------
select pg_temp.como('AT'); set local role authenticated;
select pg_temp.deve_falhar('só o administrador configura a abertura (Atendente → recusado)', $q$select public.salvar_portal_abertura('{"tipos":{"incidente":{"ativo":true}}}'::jsonb)$q$, 'administrador');
reset role;
select pg_temp.como('ADM'); set local role authenticated;
select pg_temp.deve_falhar('não dá para desativar TODOS os tipos', $q$select public.salvar_portal_abertura('{"tipos":{"incidente":{"ativo":false},"requisicao":{"ativo":false},"visita":{"ativo":false},"preventiva":{"ativo":false}}}'::jsonb)$q$, 'pelo menos um');
select public.salvar_portal_abertura('{"tipos":{"incidente":{"ativo":true,"rotulo":"Reportar defeito","descricao":"Algo quebrou"},"visita":{"ativo":false}},"prioridade":{"solicitante_escolhe":false},"canais":{"email":true}}'::jsonb);
reset role;
select pg_temp.como('U1'); set local role authenticated;
create temp table _cfg2 as select public.portal_abertura_config(pg_temp.i('A')) j;
reset role;
select pg_temp.reg('config da empresa: rótulo editado aparece; tipo desativado some; "solicitante escolhe" desligado',
  (select exists (select 1 from jsonb_array_elements(j->'tipos') t where t->>'value' = 'incidente' and t->>'rotulo' = 'Reportar defeito') and not exists (select 1 from jsonb_array_elements(j->'tipos') t where t->>'value' = 'visita')
          and not (j->'prioridade'->>'solicitante_escolhe')::boolean from _cfg2));
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('tipo desativado pela empresa → não abre', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','visita','categoria_id',%L,'titulo','Visita','descricao','Descrição com mais de dez letras'))$q$, pg_temp.i('A'), pg_temp.i('CV')), 'não está disponível');
create temp table _sp as select public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'incidente', 'categoria_id', pg_temp.i('CV'), 'titulo', 'Sem escolha', 'descricao', 'Descrição com mais de dez letras')) j;
reset role;
select pg_temp.reg('com "solicitante escolhe" desligado: abre sem prioridade informada (o N1 classifica; sugestão do catálogo)',
  (select prioridade_informada is null and impacto = 'medio' and urgencia = 'media' from public.orders where id = (select (j->>'id')::uuid from _sp)));

-- ---------- 11. preferências e consentimento ----------
select pg_temp.como('U1'); set local role authenticated;
select public.portal_salvar_preferencias(pg_temp.i('T'), false, '(71) 98888-7777', true);
create temp table _pf as select public.portal_minhas_preferencias(pg_temp.i('T')) j;
reset role;
select pg_temp.reg('preferências: canal e-mail desligado, celular salvo só com dígitos, consentimento dado',
  (select not (j->>'canal_email')::boolean and j->>'celular' = '71988887777' and (j->>'aceite_comunicacao')::boolean from _pf));
select pg_temp.como('U1'); set local role authenticated;
select public.portal_salvar_preferencias(pg_temp.i('T'), true, null, false);
select pg_temp.reg('preferências: retirar o consentimento (LGPD) é registrado', not (public.portal_minhas_preferencias(pg_temp.i('T'))->>'aceite_comunicacao')::boolean);
select pg_temp.deve_falhar('celular inválido → recusado', format('select public.portal_salvar_preferencias(%L, true, %L, null)', pg_temp.i('T'), '123'), 'Celular');
reset role;
select pg_temp.como('X'); set local role authenticated;
select pg_temp.deve_falhar('preferências de OUTRO portal (sem vínculo) → recusado', format('select public.portal_minhas_preferencias(%L)', (select id from public.tenants where name not like 'Infox%' limit 1)), 'Sem acesso');
reset role;

select count(*) filter (where not ok) as falhas, count(*) as total,
       coalesce(json_agg(json_build_object('teste', teste, 'detalhe', detalhe) order by n) filter (where not ok), '[]') as detalhes
from _r;
rollback;
