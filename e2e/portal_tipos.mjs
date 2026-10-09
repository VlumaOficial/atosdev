// O tipo de chamado do portal depende só da configuração da empresa; o assunto é obrigatório só quando há categorias.
// Também: item "Portal do cliente" no menu da equipe.
import { chromium } from 'playwright'
import { N, U, T, SB, anon, cred, sql, ok, resumo, token, entrar } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const admTok = await token(cred.admin)
const SENHA = 'Senha-E6tp-123'
const acesso = async (tok, body) => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json() }
const limpar = () => sql(`delete from orders where title like 'E6TP %'; delete from os_categorias where nome like 'E6TP %'; delete from auth.users where email like 'e6tp.%'; delete from portal_pessoas where email like 'e6tp.%'; delete from portal_convites where email like 'e6tp.%'`)
limpar()
// guarda e zera os tipos das categorias existentes (restaura no fim) para o teste não depender do catálogo real
const antes = sql(`select id, tipos_portal from os_categorias`)
sql(`update os_categorias set tipos_portal = '{}'`)
sql(`update tenants set portal_abertura='{}' where id='${T}'`)
sql(`update clients set portal_ativo = true where name='Cliente Trigger Teste'`)
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal) values ('${T}','E6TP Rede', true, '{incidente}')`)
const cat = sql(`select id from os_categorias where nome='E6TP Rede'`)[0].id
await acesso(admTok, { acao: 'convidar', client_id: CLI, email: 'e6tp.pessoa@example.com', nome: 'E6TP Pessoa', perfil: 'usuario' })
const tk = sql(`select detalhe->>'link_teste' l from portal_auditoria where detalhe->>'link_teste' is not null order by id desc limit 1`)[0].l.split('/convite/')[1]
await acesso(null, { acao: 'aceitar', token: tk, nome: 'E6TP Pessoa', senha: SENHA })
const uid = sql(`select user_id from portal_pessoas where email='e6tp.pessoa@example.com'`)[0].user_id
sql(`insert into termos_aceites (user_id, tenant_id, termo_id, canal) select '${uid}','${T}', x.id, 'portal' from portal_termos_vigentes('${T}') x`)
const pTok = await token(['e6tp.pessoa@example.com', SENHA])
const rpc = async (fn, args) => { const r = await fetch(SB + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + pTok, 'Content-Type': 'application/json' }, body: JSON.stringify(args) }); return { s: r.status, j: await r.json() } }

// ---- servidor
let r = await rpc('portal_abertura_config', { p_client: CLI })
const tipos = (r.j.tipos ?? []).map(t => t.value)
ok(['incidente', 'requisicao', 'visita', 'preventiva'].every(t => tipos.includes(t)), 'os 4 tipos ativos aparecem mesmo sem categoria para a maioria: ' + tipos.join(','))
const base = { client_id: CLI, titulo: 'E6TP chamado sem assunto', descricao: 'Chamado de teste sem assunto', nivel: 'baixo', compartilhado: false }
r = await rpc('portal_abrir_chamado', { p: { ...base, tipo: 'requisicao' } })
ok(r.s === 200 && r.j.numero, 'tipo sem categorias: abre sem assunto ' + JSON.stringify(r.j).slice(0, 80))
ok(sql(`select categoria_id is null as sem, grupo_id is null as sg, origem from orders where title='E6TP chamado sem assunto'`)[0]?.sem === true, 'o chamado nasce sem categoria (cai na fila de entrada)')
r = await rpc('portal_abrir_chamado', { p: { ...base, tipo: 'incidente' } })
ok(r.s >= 400 && /assunto/i.test(r.j.message ?? ''), 'tipo COM categorias: o assunto continua obrigatório: ' + (r.j.message ?? r.s))
r = await rpc('portal_abrir_chamado', { p: { ...base, tipo: 'incidente', categoria_id: cat, titulo: 'E6TP incidente com assunto' } })
ok(!/assunto/i.test(r.j.message ?? ''), 'com o assunto escolhido não reclama do assunto: ' + JSON.stringify(r.j).slice(0, 90))
r = await rpc('portal_abrir_chamado', { p: { ...base, tipo: 'requisicao', categoria_id: cat } })
ok(r.s >= 400 && /assunto/i.test(r.j.message ?? ''), 'categoria que não vale para o tipo é recusada: ' + (r.j.message ?? r.s))
sql(`update tenants set portal_abertura = '{"tipos":{"preventiva":{"ativo":false}}}' where id='${T}'`)
r = await rpc('portal_abrir_chamado', { p: { ...base, tipo: 'preventiva' } })
ok(r.s >= 400 && /não está disponível/i.test(r.j.message ?? ''), 'tipo DESATIVADO na configuração continua indisponível: ' + (r.j.message ?? r.s))
r = await rpc('portal_abertura_config', { p_client: CLI }); ok(!(r.j.tipos ?? []).some(t => t.value === 'preventiva'), 'tipo desativado some do portal')
sql(`update tenants set portal_abertura='{}' where id='${T}'`)

// ---- telas
const b = await chromium.launch(); const erros = []
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => erros.push(e.message))
await p.goto(PH + '/entrar'); await p.fill('#portal-email', 'e6tp.pessoa@example.com'); await p.fill('#portal-senha', SENHA); await p.click('[data-testid=portal-entrar] button[type=submit]'); await p.waitForTimeout(4500)
await p.goto(PH + '/abrir'); await p.waitForSelector('[data-tipo]', { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(1500)
const cards = await p.locator('[data-tipo]').count()
ok(cards === 4, 'a tela de abrir mostra os 4 cartões ativos (' + cards + ')')
await p.locator('[data-tipo="requisicao"]').click(); await p.waitForTimeout(600)
ok(await p.locator('#ab-assunto').count() === 0, 'tipo sem categorias: o campo Assunto não aparece')
await p.locator('[data-tipo="incidente"]').click(); await p.waitForTimeout(600)
ok(await p.locator('#ab-assunto').count() === 1, 'tipo com categorias: o campo Assunto aparece')
await p.locator('[data-tipo="requisicao"]').click(); await p.waitForTimeout(400)
await p.fill('#ab-titulo', 'E6TP pela tela sem assunto'); await p.fill('#ab-desc', 'Pedido feito pela tela, sem assunto')
await p.getByTestId('enviar-chamado').click(); await p.waitForTimeout(5000)
ok(sql(`select count(*)::int n from orders where title='E6TP pela tela sem assunto'`)[0].n === 1, 'abrir pela tela sem assunto funciona')

// ---- menu da equipe + configuração
const a = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); a.on('pageerror', e => erros.push(e.message))
await entrar(a, cred.admin)
const li = a.locator('nav a[href="/portal-cliente"]')
ok(await li.count() === 1, 'menu do administrador tem "Portal do cliente"')
ok((await li.getAttribute('href')) === '/portal-cliente', 'o item abre a página do portal dentro do ATOS')
await li.click(); await a.waitForSelector('[data-testid=portal-cliente-pagina]', { timeout: 15000 }); await a.waitForTimeout(2000)
ok((await a.getByTestId('portal-endereco').innerText()).includes('atendimento.infoxtec.dev.vluma.com.br'), 'a página mostra o endereço que os clientes usam')
ok((await a.getByTestId('abrir-portal').getAttribute('href')).includes('atendimento.infoxtec.dev.vluma.com.br') && (await a.getByTestId('abrir-portal').getAttribute('target')) === '_blank', '"Ver a tela de entrada do cliente" abre o endereço oficial em outra aba')
ok(await a.locator('[data-pronto]').count() === 4, 'checklist "o que falta para os clientes abrirem chamados" com 4 linhas')
ok((await a.locator('[data-testid=portal-cliente-pagina]').innerText()).includes('4 de 4 tipos de chamado liberados'), 'mostra quantos tipos de chamado estão liberados (4 de 4)')
const n = sql(`select count(*)::int n from clients where portal_ativo and active`)[0].n
ok((await a.locator('[data-testid=portal-cliente-pagina]').innerText()).includes(`${n} cliente(s) com o portal ligado`), `mostra quantos clientes têm o portal ligado (${n})`)
await a.goto(U + '/configuracoes?secao=portal'); await a.waitForSelector('[data-secao="portal-abertura"]', { timeout: 20000 })
if (!(await a.getByTestId('portal-abertura-config').isVisible().catch(() => false))) await a.locator('[data-secao="portal-abertura"]').click()
await a.waitForSelector('[data-testid=portal-abertura-config]'); await a.waitForTimeout(2500)
ok(await a.locator('[data-aviso-tipo="requisicao"]').count() === 1 && await a.locator('[data-aviso-tipo="incidente"]').count() === 0, 'a configuração informa os tipos sem categoria (sem dizer que o cartão some)')
ok(!/não vê este cartão/.test(await a.getByTestId('portal-abertura-config').innerText()), 'o texto antigo ("o cliente não vê este cartão") saiu')
const at = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage()
await entrar(at, cred.atendente); ok(await at.locator('nav a[href="/portal-cliente"]').count() === 0, 'o Atendente não vê o item (só administrador e gestor)')

console.log('erros:', erros.filter(e => !/favicon/.test(e)))
for (const x of antes) sql(`update os_categorias set tipos_portal = '{${(x.tipos_portal ?? []).join(',')}}' where id='${x.id}'`)
limpar(); sql(`update tenants set portal_abertura='{}' where id='${T}'`); resumo(); await b.close()
