-- ============================================================
-- ATOS — Roteiro de testes: Resolvido → Fechado, reabrir, novo chamado ligado e assinatura como confirmação (E5c)
-- ============================================================
-- Desfaz tudo no fim (rollback). Saída: {"falhas": N, "total": N, "detalhes": [...]}.
-- Pré-requisitos (massa de teste do DEV): empresa Infoxtec com o portal ativo,
-- clientes "Cliente Trigger Teste" (A) e "Atakarejo" (B), a Supervisora
-- portal.teste@example.com (A), o admin adm@infoxtec.com.br, o Atendente
-- atendente.teste@infoxtec.com.br, o técnico "Infoxtec Teste".
-- IMPORTANTE (lição de 2026-10-09): nada de EXCEPTION no bloco externo; cada
-- chamada que deve falhar usa pg_temp.deve_falhar. Valide o roteiro com uma
-- falha plantada antes de confiar nele.
-- Uso: sql.sh supabase/tests/resolvido_fechado.sql
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





update public.tenants set fechamento_dias_uteis = 3 where id = pg_temp.i('T');
update public.orders set require_signature = false where id in (pg_temp.i('O1'), pg_temp.i('OI'), pg_temp.i('OV'));
create function pg_temp.chamado(p_titulo text) returns uuid language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.como('U1'); set local role authenticated;
  v := public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'incidente', 'categoria_id', pg_temp.i('CV'), 'titulo', p_titulo, 'descricao', 'Chamado para testar o fechamento do ciclo', 'impacto', 'alto', 'urgencia', 'alta'));
  reset role;
  return (v->>'id')::uuid;
end $$;
update public.orders set require_signature = false where id = pg_temp.i('O1');

-- ---------- 1. Resolvido: o cliente vê o resumo e as opções ----------
update public.orders set technician_id = pg_temp.i('TEC'), status = 'em_andamento' where id = pg_temp.i('O1');
update public.orders set status = 'concluida', completed_at = now(), completion_notes = 'Trocamos o switch do rack e testamos os pontos.' where id = pg_temp.i('O1');
select pg_temp.reg('concluir NÃO fecha: a OS fica "aguardando a confirmação do cliente"', (select status = 'concluida' and fechada_em is null from public.orders where id = pg_temp.i('O1')));
select pg_temp.como('U1'); set local role authenticated;
create temp table _z_a1 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
reset role;
select pg_temp.reg('portal: status "resolvido" com o resumo, as duas opções e o prazo do fechamento automático',
  (select j->>'status' = 'resolvido' and j#>>'{resolucao,resumo}' like 'Trocamos o switch%' and (j#>>'{resolucao,pode_confirmar}')::boolean and (j#>>'{resolucao,pode_nao_resolvido}')::boolean and j#>>'{resolucao,fecha_em}' is not null and not (j#>>'{resolucao,pode_novo_chamado}')::boolean from _z_a1), (select j->>'resolucao' from _z_a1));

-- ---------- 2. confirmar a solução ----------
select pg_temp.como('U3'); set local role authenticated;
select pg_temp.deve_falhar('pessoa de fora da equipe não confirma', format('select public.portal_confirmar_solucao(%L)', pg_temp.i('O1')), 'Chamado não encontrado');
reset role;
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('chamado em andamento não pode ser "confirmado"', format('select public.portal_confirmar_solucao(%L)', pg_temp.i('OV')), 'aguardando a sua confirmação');
select public.portal_confirmar_solucao(pg_temp.i('O1'));
create temp table _z_a2 as select public.portal_obter_chamado(pg_temp.i('O1')) j;
create temp table _z_l2 as select public.portal_listar_chamados(pg_temp.i('T'), 'todos') j;
reset role;
select pg_temp.reg('confirmar: o chamado FECHA (fechada_em, tipo "confirmada", evento) e a OS continua Concluída por dentro',
  (select status = 'concluida' and fechada_em is not null and fechamento_tipo = 'confirmada' from public.orders where id = pg_temp.i('O1'))
  and exists (select 1 from public.order_events where order_id = pg_temp.i('O1') and event_type = 'closed' and details->>'tipo' = 'confirmada'));
select pg_temp.reg('portal: o status passa a "fechado" (no chamado e na lista) e ele pode abrir um novo chamado ligado',
  (select j->>'status' = 'fechado' and (j#>>'{resolucao,pode_novo_chamado}')::boolean and not (j#>>'{resolucao,pode_confirmar}')::boolean from _z_a2)
  and (select exists (select 1 from jsonb_array_elements(j->'itens') i where i->>'status' = 'fechado') from _z_l2));
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('confirmar de novo → recusado', format('select public.portal_confirmar_solucao(%L)', pg_temp.i('O1')), 'aguardando a sua confirmação');
select pg_temp.deve_falhar('depois de fechado não reabre: "não foi resolvido" → novo chamado ligado', format('select public.portal_nao_resolvido(%L, %L)', pg_temp.i('O1'), 'continua errado'), 'já foi fechado');
reset role;

-- ---------- 3. "não foi resolvido" reabre ----------
insert into _id values ('O2', pg_temp.chamado('Chamado que não ficou resolvido'));
update public.orders set technician_id = pg_temp.i('TEC'), status = 'em_andamento', require_signature = false where id = pg_temp.i('O2');
update public.orders set status = 'concluida', completed_at = now() - interval '3 days', completion_notes = 'Reiniciamos o equipamento.' where id = pg_temp.i('O2');
create temp table _z_s0 as select sla_pausa_min m, prazo_solucao ps from public.orders where id = pg_temp.i('O2');
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.deve_falhar('"não foi resolvido" sem motivo → recusado', format('select public.portal_nao_resolvido(%L, %L)', pg_temp.i('O2'), 'a'), 'Conte');
select pg_temp.deve_falhar('"não foi resolvido" com motivo enorme → recusado', format('select public.portal_nao_resolvido(%L, repeat(%L, 501))', pg_temp.i('O2'), 'a'), 'Conte');
select public.portal_nao_resolvido(pg_temp.i('O2'), 'A internet voltou mas cai a cada 10 minutos');
reset role;
select pg_temp.reg('"não foi resolvido": a OS reabre para o mesmo técnico, com o motivo, conta a reabertura e não fica fechada',
  (select status = 'em_andamento' and technician_id = pg_temp.i('TEC') and reaberturas = 1 and fechada_em is null and nao_resolvido_motivo like 'A internet voltou%' from public.orders where id = pg_temp.i('O2')));
select pg_temp.reg('"não foi resolvido": evento registrado e o responsável é avisado',
  (select exists (select 1 from public.order_events where order_id = pg_temp.i('O2') and event_type = 'reopened' and details->>'por' = 'cliente')
      and exists (select 1 from public.notificacoes where order_id = pg_temp.i('O2') and tipo = 'reabertura_cliente' and user_id = pg_temp.i('TEC'))));
select pg_temp.reg('SLA: o tempo entre resolvido e reaberto NÃO conta (crédito em horas úteis e prazo mais longo)',
  (select sla_pausa_min > (select m from _z_s0) and prazo_solucao > (select ps from _z_s0) from public.orders where id = pg_temp.i('O2')),
  (select concat_ws(' | ', sla_pausa_min::text, (select m from _z_s0)::text) from public.orders where id = pg_temp.i('O2')));
-- a equipe também reabre (Reabrir): limpa o fechamento e conta
update public.orders set status = 'em_andamento' where id = pg_temp.i('O1');
select pg_temp.reg('a equipe reabre um chamado fechado: o fechamento é limpo e a reabertura contada', (select fechada_em is null and fechamento_tipo is null and reaberturas = 1 from public.orders where id = pg_temp.i('O1')));

-- ---------- 4. assinatura do solicitante = confirmação ----------
insert into _id values ('O3', pg_temp.chamado('Chamado com assinatura do solicitante'));
update public.orders set technician_id = pg_temp.i('TEC'), status = 'em_andamento', require_signature = false where id = pg_temp.i('O3');
update public.orders set signature_path = 'teste/assinatura.png', signer_name = 'Pessoa U1', assinou_solicitante = true where id = pg_temp.i('O3');
update public.orders set status = 'concluida', completed_at = now() where id = pg_temp.i('O3');
select pg_temp.reg('assinou o solicitante em campo → o chamado já nasce FECHADO (tipo "assinatura")', (select fechada_em is not null and fechamento_tipo = 'assinatura' from public.orders where id = pg_temp.i('O3')));
insert into _id values ('O4', pg_temp.chamado('Chamado assinado por outra pessoa'));
update public.orders set technician_id = pg_temp.i('TEC'), status = 'em_andamento', require_signature = false, signature_path = 'teste/outra.png', signer_name = 'Gerente da loja', assinou_solicitante = false where id = pg_temp.i('O4');
update public.orders set status = 'concluida', completed_at = now() where id = pg_temp.i('O4');
select pg_temp.reg('assinou OUTRA pessoa → continua aguardando a confirmação do solicitante', (select fechada_em is null from public.orders where id = pg_temp.i('O4')));
insert into _id values ('O5', pg_temp.chamado('Chamado sem assinatura'));
update public.orders set technician_id = pg_temp.i('TEC'), status = 'em_andamento', require_signature = false, assinou_solicitante = true where id = pg_temp.i('O5');
update public.orders set status = 'concluida', completed_at = now() where id = pg_temp.i('O5');
select pg_temp.reg('"assinou o solicitante" sem assinatura gravada NÃO fecha', (select fechada_em is null from public.orders where id = pg_temp.i('O5')));
update public.orders set status = 'em_andamento', require_signature = false, signature_path = 'teste/interna.png', assinou_solicitante = true where id = pg_temp.i('OI');
update public.orders set status = 'concluida', completed_at = now() where id = pg_temp.i('OI');
select pg_temp.reg('OS aberta pela equipe (sem solicitante): a assinatura não fecha nada', (select status = 'concluida' and fechada_em is null from public.orders where id = pg_temp.i('OI')));

-- ---------- 5. fechamento automático ----------
update public.orders set completed_at = now() - interval '12 days' where id = pg_temp.i('O4');
update public.orders set completed_at = now() where id = pg_temp.i('O5');
create temp table _z_f1 as select public.fechar_chamados_resolvidos() n;
select pg_temp.reg('automático: fecha o resolvido há mais de 3 dias úteis (tipo "automatica", evento do sistema) e NÃO o recente',
  (select n >= 1 from _z_f1) and (select fechada_em is not null and fechamento_tipo = 'automatica' from public.orders where id = pg_temp.i('O4'))
  and (select fechada_em is null from public.orders where id = pg_temp.i('O5'))
  and exists (select 1 from public.order_events where order_id = pg_temp.i('O4') and event_type = 'closed' and details->>'tipo' = 'automatica'));
update public.tenants set fechamento_dias_uteis = 0 where id = pg_temp.i('T');
update public.orders set completed_at = now() - interval '30 days' where id = pg_temp.i('O5');
create temp table _z_f2 as select public.fechar_chamados_resolvidos() n;
select pg_temp.reg('automático desligado (0 dias): nada é fechado sozinho', (select fechada_em is null from public.orders where id = pg_temp.i('O5')));
update public.tenants set fechamento_dias_uteis = 3 where id = pg_temp.i('T');
select pg_temp.como('ADM'); set local role authenticated;
select public.definir_fechamento_dias(5);
select pg_temp.deve_falhar('fechamento fora de 0 a 30 → recusado', 'select public.definir_fechamento_dias(31)', '0 a 30');
reset role;
select pg_temp.reg('o admin define os dias úteis do fechamento', (select fechamento_dias_uteis = 5 from public.tenants where id = pg_temp.i('T')));
select pg_temp.como('AT'); set local role authenticated;
select pg_temp.deve_falhar('atendente não define o fechamento', 'select public.definir_fechamento_dias(1)', 'administrador');
reset role;

-- ---------- 6. novo chamado ligado a um fechado ----------
select pg_temp.como('U1'); set local role authenticated;
create temp table _z_n1 as select public.portal_abrir_chamado(jsonb_build_object('client_id', pg_temp.i('A'), 'tipo', 'incidente', 'categoria_id', pg_temp.i('CV'), 'titulo', 'O problema voltou',
  'descricao', 'O mesmo problema do chamado fechado voltou a acontecer', 'impacto', 'alto', 'urgencia', 'alta', 'relacionada_a', pg_temp.i('O3'))) j;
select pg_temp.deve_falhar('ligar a um chamado que NÃO está fechado → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','Ligado errado','descricao','Tentando ligar a um chamado aberto','impacto','alto','urgencia','alta','relacionada_a',%L))$q$, pg_temp.i('A'), pg_temp.i('CV'), pg_temp.i('O5')), 'não está disponível');
select pg_temp.deve_falhar('ligar a um chamado de OUTRO cliente → recusado', format($q$select public.portal_abrir_chamado(jsonb_build_object('client_id',%L,'tipo','incidente','categoria_id',%L,'titulo','Ligado errado','descricao','Tentando ligar a chamado de outro','impacto','alto','urgencia','alta','relacionada_a',%L))$q$, pg_temp.i('A'), pg_temp.i('CV'), gen_random_uuid()), 'não está disponível');
reset role;
select pg_temp.reg('novo chamado ligado: nasce "relacionado a" o fechado (base da reincidência)', (select relacionada_a = pg_temp.i('O3') from public.orders where id = (select (j->>'id')::uuid from _z_n1)));

-- ---------- 7. relatório (PDF) ----------
insert into public.order_reports (tenant_id, order_id, versao, status, file_path, codigo) values (pg_temp.i('T'), pg_temp.i('O3'), 1, 'gerado', 'teste/relatorios/o3_v1.pdf', 'TESTE0001')
  on conflict (order_id, versao) do update set status = 'gerado', file_path = excluded.file_path, removido_em = null;   -- o gatilho da conclusão já cria a linha
select pg_temp.como('U1'); set local role authenticated;
select pg_temp.reg('relatório: quem enxerga o chamado resolvido recebe o caminho do PDF mais recente', (select public.portal_relatorio_chamado(pg_temp.i('O3')) = 'teste/relatorios/o3_v1.pdf'));
select pg_temp.reg('relatório: chamado ainda em andamento não tem PDF para o cliente', (select public.portal_relatorio_chamado(pg_temp.i('O2')) is null));
reset role;
select pg_temp.como('U3'); set local role authenticated;
select pg_temp.reg('relatório: pessoa de fora da equipe não recebe o PDF', (select public.portal_relatorio_chamado(pg_temp.i('O3')) is null));
reset role;

select count(*) filter (where not ok) as falhas, count(*) as total,
       coalesce(json_agg(json_build_object('teste', teste, 'detalhe', detalhe) order by n) filter (where not ok), '[]') as detalhes
from _r;
rollback;
