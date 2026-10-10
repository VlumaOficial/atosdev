// E5b parte 2a — transparência do prazo (oculto / previsão / completo, com exceção por cliente) e "prazo explicado".
import { chromium } from 'playwright'
import { N, U, T, SB, anon, cred, sql, ok, resumo, token, entrar } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const admTok = await token(cred.admin)
const SENHA = 'Senha-E5b2-1234'
const acesso = async (tok, body) => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json() }
const linkTeste = () => sql(`select detalhe->>'link_teste' l from portal_auditoria where detalhe->>'link_teste' is not null order by id desc limit 1`)[0]?.l
const limpar = () => sql(`delete from orders where title like 'E5B2 %'; delete from os_categorias where nome like 'E5B2 %'; delete from auth.users where email like 'e5b2.%'; delete from portal_pessoas where email like 'e5b2.%'; delete from portal_convites where email like 'e5b2.%'; update tenants set sla_transparencia='previsao' where id='${T}'; update clients set sla_transparencia=null where id='${CLI}'`)
limpar()
sql(`update tenants set portal_abertura='{}', sla_transparencia='previsao' where id='${T}'`)
sql(`update clients set portal_ativo = true, sla_transparencia = null where id='${CLI}'`)
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal) values ('${T}','E5B2 Rede', true, '{incidente}')`)
const cat = sql(`select id from os_categorias where nome='E5B2 Rede'`)[0].id
await acesso(admTok, { acao: 'convidar', client_id: CLI, email: 'e5b2.ana@example.com', nome: 'E5B2 Ana', perfil: 'usuario' })
await acesso(null, { acao: 'aceitar', token: linkTeste().split('/convite/')[1], nome: 'E5B2 Ana', senha: SENHA })
const uid = sql(`select user_id from portal_pessoas where email='e5b2.ana@example.com'`)[0].user_id
sql(`insert into termos_aceites (user_id, tenant_id, termo_id, canal) select '${uid}','${T}', x.id, 'portal' from portal_termos_vigentes('${T}') x`)
const anaTok = await token(['e5b2.ana@example.com', SENHA])
const aberto = await (await fetch(SB + '/rest/v1/rpc/portal_abrir_chamado', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + anaTok, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p: { client_id: CLI, tipo: 'incidente', categoria_id: cat, titulo: 'E5B2 switch parado', descricao: 'O switch do andar parou de responder', impacto: 'alto', urgencia: 'alta', compartilhado: false } }) })).json()
const oid = aberto.id
const tec = sql(`select id from users where email='${cred.tecnico[0]}'`)[0].id
const M_ACIONA = sql(`select id from motivos_pausa where tenant_id='${T}' and nome='Aguardando o cliente'`)[0].id
ok(!!oid, 'chamado aberto: ' + aberto.numero)
const b = await chromium.launch(); const erros = []
const nova = async (opts = { viewport: { width: 1366, height: 950 } }) => { const p = await (await b.newContext(opts)).newPage(); p.on('pageerror', e => erros.push(e.message)); return p }
const ad = await nova(); await entrar(ad, cred.admin)
const an = await nova(); await an.goto(PH + '/entrar'); await an.fill('#portal-email', 'e5b2.ana@example.com'); await an.fill('#portal-senha', SENHA); await an.click('[data-testid=portal-entrar] button[type=submit]'); await an.waitForTimeout(4500)
const ver = async () => { await an.goto(PH + '/chamados/' + oid); await an.waitForSelector('[data-testid=conversa]', { timeout: 20000 }); await an.waitForTimeout(1500) }

// ===== previsão (padrão) =====
await ver()
ok(await an.getByTestId('prazos').getAttribute('data-nivel') === 'previsao', 'padrão "Previsão": o cliente vê o cartão de previsões')
ok(await an.getByTestId('previsao-atendimento').count() === 1 && await an.getByTestId('previsao-solucao').count() === 1, 'com a previsão de atendimento e a de solução')
ok(await an.getByTestId('situacao-prazo').count() === 0, 'sem o selo no prazo / fora do prazo')

// ===== a empresa muda em Configurações =====
await ad.goto(U + '/configuracoes'); await ad.waitForSelector('[data-secao="portal-abertura"]', { timeout: 20000 })
if (!(await ad.getByTestId('portal-abertura-config').isVisible().catch(() => false))) await ad.locator('[data-secao="portal-abertura"]').click()
await ad.waitForSelector('[data-testid=config-transparencia]')
await ad.getByTestId('select-transparencia').selectOption('completo'); await ad.waitForTimeout(2500)
ok(sql(`select sla_transparencia t from tenants where id='${T}'`)[0].t === 'completo', 'Configurações: a empresa escolhe "Completo"')
await ver()
ok(await an.getByTestId('prazos').getAttribute('data-nivel') === 'completo' && (await an.getByTestId('situacao-prazo').innerText()) === 'No prazo', '"Completo": aparece "No prazo"')
sql(`update orders set prazo_solucao = now() - interval '2 hours' where id='${oid}'`)
await ver(); ok((await an.getByTestId('situacao-prazo').innerText()) === 'Fora do prazo', '"Completo": prazo vencido mostra "Fora do prazo"')
await ad.getByTestId('select-transparencia').selectOption('oculto'); await ad.waitForTimeout(2500)
await ver(); ok(await an.getByTestId('prazos').count() === 0, '"Oculto": o cliente não vê prazo nenhum')

// ===== exceção por cliente =====
await ad.getByTestId('select-transparencia').selectOption('completo'); await ad.waitForTimeout(2000)
await ad.goto(U + '/clientes'); await ad.waitForTimeout(3000)
await ad.locator('tr', { hasText: 'Cliente Trigger Teste' }).locator('td').last().locator('button').first().click(); await ad.waitForSelector('[data-testid=abas-cliente]')
await ad.getByTestId('aba-portal').click(); await ad.waitForSelector('[data-testid=transparencia-cliente]', { timeout: 15000 })
ok((await ad.getByTestId('select-transparencia-cliente').inputValue()) === '', 'aba Portal do cliente: começa em "Usar o padrão da empresa"')
await ad.getByTestId('select-transparencia-cliente').selectOption('oculto'); await ad.waitForTimeout(2000)
ok(sql(`select sla_transparencia t from clients where id='${CLI}'`)[0].t === 'oculto', 'a exceção do cliente é salva')
await ver(); ok(await an.getByTestId('prazos').count() === 0, 'a exceção (oculto) vale mesmo com a empresa em "Completo"')
await ad.getByTestId('select-transparencia-cliente').selectOption(''); await ad.waitForTimeout(2000)
ok(sql(`select sla_transparencia t from clients where id='${CLI}'`)[0].t === null, 'voltar ao padrão limpa a exceção')

// ===== prazo explicado: pausa que aciona o cliente e a resposta =====
sql(`update tenants set sla_transparencia='previsao' where id='${T}'; update orders set technician_id='${tec}', status='em_andamento', started_at=now(), prazo_solucao = now() + interval '2 days' where id='${oid}'`)
await ad.goto(U + '/os/' + oid); await ad.waitForSelector('[data-testid=conversa-os]', { timeout: 20000 }); await ad.waitForTimeout(1500)
await ad.getByRole('button', { name: 'Pausar' }).click(); await ad.waitForSelector('#motivo-pausa'); await ad.selectOption('#motivo-pausa', M_ACIONA); await ad.waitForTimeout(400)
await ad.getByTestId('pausa-mensagem').fill('Precisamos que o responsável confirme o horário para trocar o switch.'); await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3500)
await ver()
ok(await an.getByTestId('prazo-pausado').count() === 1, 'prazo parado: o cliente vê "o prazo está parado no momento"')
await an.getByTestId('mensagem-texto').fill('Pode ser amanhã às 9h.'); await an.getByTestId('enviar-mensagem').click(); await an.waitForTimeout(5000)
await ver()
const lt = await an.getByTestId('linha-do-tempo').innerText()
ok(lt.includes('Em pausa: Aguardando a sua resposta') && lt.includes('Atendimento retomado'), 'andamento: mostra a pausa e a retomada')
ok(await an.getByTestId('prazo-explicado').count() >= 1 && (await an.getByTestId('prazo-explicado').first().innerText()).includes('Prazo ajustado: o prazo ficou parado de'), 'andamento: "Prazo ajustado: o prazo ficou parado de … a …"')
ok(!(await an.locator('body').innerText()).includes('Aguardando o cliente —'), 'o texto interno da pausa não aparece para o cliente')
ok(await an.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal')
console.log('erros:', erros.filter(e => !/favicon/.test(e)))
limpar(); resumo(); await b.close()
