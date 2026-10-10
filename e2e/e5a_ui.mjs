// E5a — conversa com o cliente e triagem do N1, de ponta a ponta na URL pública.
import { chromium, devices } from 'playwright'
import { N, U, T, SB, anon, cred, sql, ok, resumo, token, entrar } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const admTok = await token(cred.admin)
const SENHA = 'Senha-E5a-1234'
const acesso = async (tok, body) => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json() }
const linkTeste = () => sql(`select detalhe->>'link_teste' l from portal_auditoria where detalhe->>'link_teste' is not null order by id desc limit 1`)[0]?.l
const limpar = () => sql(`delete from orders where title like 'E5A %'; delete from os_categorias where nome like 'E5A %'; delete from grupos_atendimento where nome like 'E5A %'; delete from auth.users where email like 'e5a.%'; delete from portal_pessoas where email like 'e5a.%'; delete from portal_convites where email like 'e5a.%'`)
limpar()
sql(`update tenants set portal_abertura='{}' where id='${T}'`)
sql(`update clients set portal_ativo = true where name='Cliente Trigger Teste'`)
sql(`insert into grupos_atendimento (tenant_id, nome, nivel) values ('${T}','E5A Redes','n2')`)
const G = sql(`select id from grupos_atendimento where nome='E5A Redes'`)[0].id
const adm = sql(`select id from users where email='${cred.admin[0]}'`)[0].id
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal) values ('${T}','E5A Rede', true, '{incidente}')`)
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal, grupo_padrao_id) values ('${T}','E5A Outro assunto', true, '{incidente}', '${G}')`)
const cat = sql(`select id from os_categorias where nome='E5A Rede'`)[0].id
async function criar(nome, email) {
  await acesso(admTok, { acao: 'convidar', client_id: CLI, email, nome, perfil: 'usuario' })
  await acesso(null, { acao: 'aceitar', token: linkTeste().split('/convite/')[1], nome, senha: SENHA })
  const uid = sql(`select user_id from portal_pessoas where email='${email}'`)[0].user_id
  sql(`insert into termos_aceites (user_id, tenant_id, termo_id, canal) select '${uid}','${T}', x.id, 'portal' from portal_termos_vigentes('${T}') x`)
  return uid
}
const ana = await criar('E5A Ana', 'e5a.ana@example.com')
const anaTok = await token(['e5a.ana@example.com', SENHA])
const aberto = await (await fetch(SB + '/rest/v1/rpc/portal_abrir_chamado', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + anaTok, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p: { client_id: CLI, tipo: 'incidente', categoria_id: cat, titulo: 'E5A câmera sem imagem', descricao: 'A câmera da entrada parou de gravar desde ontem', impacto: 'alto', urgencia: 'alta', compartilhado: false } }) })).json()
const oid = aberto.id
ok(!!oid, 'chamado do portal aberto pela Ana: ' + (aberto.numero ?? JSON.stringify(aberto).slice(0, 80)))
const tec = sql(`select id from users where email='${cred.tecnico[0]}'`)[0].id

const b = await chromium.launch(); const erros = []
const nova = async (opts = { viewport: { width: 1366, height: 950 } }) => { const p = await (await b.newContext(opts)).newPage(); p.on('pageerror', e => erros.push(e.message)); p.on('response', r => { if (r.status() >= 400 && !/token\?grant_type|\/rest\/v1\/rpc|favicon/.test(r.url())) erros.push(r.status() + ' ' + r.url().slice(0, 110)) }); return p }

// ===== equipe: Responder ao cliente / Nota interna =====
const ad = await nova(); await entrar(ad, cred.admin)
await ad.goto(U + '/os/' + oid); await ad.waitForSelector('[data-testid=conversa-os]', { timeout: 20000 }); await ad.waitForTimeout(1500)
ok(await ad.getByTestId('responder-cliente').count() === 1 && await ad.getByTestId('nota-interna').count() === 1, 'OS do portal: os DOIS botões "Responder ao cliente" e "Nota interna"')
ok(await ad.getByTestId('responder-cliente').isDisabled() && await ad.getByTestId('nota-interna').isDisabled(), 'sem texto, os dois botões ficam desligados')
await ad.getByTestId('conversa-texto').fill('Olá Ana, vamos verificar a câmera ainda hoje.'); await ad.getByTestId('responder-cliente').click(); await ad.waitForTimeout(2500)
await ad.getByTestId('conversa-texto').fill('NOTA-SECRETA-E5A cliente com histórico de queda de energia'); await ad.getByTestId('nota-interna').click(); await ad.waitForTimeout(2500)
if (!(await ad.getByTestId('conversa-lista').isVisible().catch(() => false))) await ad.locator('[data-testid=conversa-os] button', { hasText: 'mensage' }).first().click()
ok(await ad.locator('[data-visibilidade="cliente"]').count() === 1 && await ad.locator('[data-visibilidade="interno"]').count() === 1, 'a lista separa "Resposta ao cliente" e "Nota interna" com selos')
ok((await ad.getByTestId('conversa-lista').innerText()).includes('Resposta ao cliente') && (await ad.getByTestId('conversa-lista').innerText()).includes('Nota interna'), 'os selos aparecem')
ok(sql(`select respondido_em is not null r from orders where id='${oid}'`)[0].r === true, 'a 1ª resposta pública marcou o respondido_em do SLA')

// ===== cliente: vê a resposta, não vê a nota, responde com foto =====
const an = await nova(); await an.goto(PH + '/entrar'); await an.fill('#portal-email', 'e5a.ana@example.com'); await an.fill('#portal-senha', SENHA); await an.click('[data-testid=portal-entrar] button[type=submit]'); await an.waitForTimeout(4500)
await an.goto(PH + '/chamados/' + oid); await an.waitForSelector('[data-testid=conversa]', { timeout: 20000 }); await an.waitForTimeout(1500)
const conv = await an.getByTestId('conversa').innerText()
ok(conv.includes('Olá Ana, vamos verificar') && /Admin\w* · atendimento|Administrador · atendimento/.test(conv), 'portal: a Ana vê a resposta da empresa, com o 1º nome de quem respondeu')
ok(!(await an.locator('body').innerText()).includes('NOTA-SECRETA'), 'portal: a nota interna NÃO aparece')
await an.getByTestId('mensagem-texto').fill('Podem vir amanhã de manhã, por favor. Segue a foto da câmera.')
await an.getByTestId('mensagem-input-foto').setInputFiles(N + '/foto1.png'); await an.waitForTimeout(1500)
ok(await an.locator('[data-testid=mensagem-fotos] li').count() === 1, 'a foto aparece na prévia da mensagem')
await an.getByTestId('enviar-mensagem').click(); await an.waitForTimeout(5000)
ok(await an.locator('[data-autor="cliente"]').count() === 1 && (await an.locator('[data-autor="cliente"]').innerText()).includes('Você'), 'a mensagem da Ana aparece como "Você"')
await an.waitForSelector('[data-autor="cliente"] img', { timeout: 15000 }).catch(() => {})
ok(await an.locator('[data-autor="cliente"] img').count() === 1 && await an.locator('[data-autor="cliente"] img').evaluate(i => i.naturalWidth > 0), 'a foto da mensagem carrega (endereço assinado)')
const cm = sql(`select visibilidade, autor_portal_id is not null a, (select count(*)::int from os_anexos_cliente x where x.comentario_id = c.id) n from order_comments c where comment like 'Podem vir amanhã%'`)[0]
ok(cm.visibilidade === 'cliente' && cm.a && cm.n === 1, 'banco: mensagem do cliente com autoria da pessoa e 1 foto ligada à mensagem')
ok(!(await an.getByTestId('portal-chamado').innerText()).includes('Fotos e áudio enviados'), 'a foto da mensagem não entra na lista de fotos do chamado (fica na conversa)')

// ===== avisos: sino da equipe e e-mail =====
const avisos = sql(`select count(*)::int n from notificacoes where order_id='${oid}' and tipo='mensagem_cliente'`)[0].n
ok(avisos >= 1, `sino: a equipe foi avisada da mensagem do cliente (${avisos} aviso(s))`)
await ad.goto(U + '/os'); await ad.waitForTimeout(2500)
await ad.getByTestId('sino').first().click(); await ad.waitForSelector('[data-testid=sino-painel]')
ok(/nova mensagem do cliente/.test(await ad.locator('[data-testid=sino-painel]').innerText()), 'sino: "nova mensagem do cliente" aparece para o administrador')
await ad.locator('[data-aviso*="nova mensagem do cliente"]').first().click(); await ad.waitForTimeout(3500)
ok(ad.url().includes('/os/' + oid), 'tocar no aviso abre a OS')
await ad.waitForSelector('[data-testid=conversa-os]'); await ad.waitForTimeout(1500)
if (!(await ad.getByTestId('conversa-lista').isVisible().catch(() => false))) await ad.locator('[data-testid=conversa-os] button', { hasText: 'mensage' }).first().click()
ok(await ad.locator('[data-visibilidade="do-cliente"]').count() === 1, 'a mensagem do cliente aparece na OS com o selo "Cliente"')
await ad.waitForSelector('[data-visibilidade="do-cliente"] img', { timeout: 15000 }).catch(() => {})
await ad.waitForFunction(() => { const i = document.querySelector('[data-visibilidade="do-cliente"] img'); return i && i.complete && i.naturalWidth > 0 }, null, { timeout: 15000 }).catch(() => {})
const diag = await ad.evaluate(() => { const bloco = document.querySelector('[data-visibilidade="do-cliente"]'); const i = bloco?.querySelector('img'); return { imgs: bloco?.querySelectorAll('img').length, w: i?.naturalWidth, src: (i?.src || '').slice(0, 60), anexos: bloco?.querySelectorAll('[data-anexo]').length, html: (bloco?.innerHTML || '').slice(0, 200) } })
ok(diag.imgs === 1 && diag.w > 0, 'a equipe vê a foto da mensagem ' + JSON.stringify(diag))
await new Promise(r => setTimeout(r, 6000))
const av = sql(`select evento, enviado, motivo from portal_avisos where order_id='${oid}' and evento like 'mensagem:%'`)
ok(av.length >= 1, 'e-mail de "nova mensagem": a função foi chamada pelo banco para a resposta da equipe (' + JSON.stringify(av[0] ?? null) + ')')

// ===== triagem do N1 =====
await ad.goto(U + '/os/' + oid); await ad.waitForSelector('[data-testid=triagem]', { timeout: 20000 }); await ad.waitForTimeout(1500)
ok((await ad.getByTestId('triagem-estado').innerText()).includes('aguardando a triagem') && (await ad.getByTestId('triagem-estado').innerText()).includes('Crítico'), 'triagem: mostra a prioridade informada e "aguardando a triagem"')
await ad.getByTestId('abrir-reclassificar').click(); await ad.waitForSelector('[data-testid=form-reclassificar]')
ok((await ad.getByTestId('prioridade-resultante').innerText()).includes('Crítico'), 'modo matriz: a prioridade resultante começa em Crítico (alto × alta)')
await ad.selectOption('#rc-imp', 'baixo'); await ad.selectOption('#rc-urg', 'baixa')
ok((await ad.getByTestId('prioridade-resultante').innerText()).includes('Baixo'), 'ao mudar impacto e urgência, a prioridade resultante acompanha (Baixo)')
await ad.getByTestId('salvar-reclassificar').click(); await ad.waitForTimeout(800)
ok((await ad.getByTestId('erro-reclassificar').innerText()).includes('motivo'), 'sem motivo → aviso claro, nada é salvo')
await ad.fill('#rc-motivo', 'Câmera isolada, sem impacto na operação da loja'); await ad.selectOption('#rc-cat', { label: 'E5A Outro assunto' })
await ad.getByTestId('salvar-reclassificar').click(); await ad.waitForTimeout(4000)
const o = sql(`select priority, prioridade_informada, grupo_id, classificada_em is not null c from orders where id='${oid}'`)[0]
ok(o.priority === 'baixo' && o.prioridade_informada === 'critico' && o.c && o.grupo_id === G, 'banco: prioridade Baixo, a informada continua Crítico, classificada, e o assunto levou ao grupo padrão')
ok((await ad.getByTestId('triagem-estado').innerText()).includes('classificada'), 'a tela passa a mostrar "classificada por … em …"')
ok((await ad.getByTestId('reclassificacoes').innerText()).includes('Crítico → Baixo') && (await ad.getByTestId('reclassificacoes').innerText()).includes('Câmera isolada'), 'o histórico de reclassificação mostra de → para e o motivo')
ok(await ad.getByTestId('confirmar-triagem').count() === 0, '"Confirmar prioridade" some depois de classificada')
await an.goto(PH + '/chamados/' + oid); await an.waitForSelector('[data-testid=linha-do-tempo]'); await an.waitForTimeout(1500)
ok((await an.getByTestId('linha-do-tempo').innerText()).includes('Prioridade ajustada de Crítico para Baixo') && (await an.getByTestId('motivo-reclassificacao').innerText()).includes('Câmera isolada'), 'portal: o cliente vê "Prioridade ajustada de Crítico para Baixo" com o motivo')

// ===== atendente triagem; técnico responde =====
sql(`update orders set technician_id='${tec}', status='agendada', scheduled_at = now() + interval '2 days' where id='${oid}'`)
const at = await nova(); await entrar(at, cred.atendente)
await at.goto(U + '/os/' + oid); await at.waitForSelector('[data-testid=triagem]', { timeout: 20000 }); await at.waitForTimeout(1500)
ok(await at.getByTestId('abrir-reclassificar').count() === 1, 'o Atendente também faz a triagem')
const tc = await nova({ ...devices['iPhone 13'] }); await entrar(tc, cred.tecnico)
await tc.goto(U + '/campo/os/' + oid); await tc.waitForSelector('[data-testid=conversa-os]', { timeout: 20000 }); await tc.waitForTimeout(1500)
ok(await tc.getByTestId('triagem').count() === 0, 'o técnico NÃO vê a triagem')
ok(await tc.getByTestId('responder-cliente').count() === 1, 'o técnico responsável vê "Responder ao cliente" no app')
await tc.getByTestId('conversa-texto').fill('Chego amanhã às 9h, a equipe já está a caminho.'); await tc.getByTestId('responder-cliente').click(); await tc.waitForTimeout(2500)
ok(sql(`select count(*)::int n from order_comments where comment like 'Chego amanhã%' and visibilidade='cliente'`)[0].n === 1, 'a resposta do técnico chega ao cliente')
ok(await tc.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'app do técnico sem rolagem horizontal')
await an.goto(PH + '/chamados/' + oid); await an.waitForSelector('[data-testid=conversa]'); await an.waitForTimeout(1500)
ok((await an.getByTestId('conversa').innerText()).includes('Chego amanhã'), 'a Ana vê a resposta do técnico')

// ===== celular =====
const m = await nova({ ...devices['iPhone 13'] }); await m.goto(PH + '/entrar'); await m.fill('#portal-email', 'e5a.ana@example.com'); await m.fill('#portal-senha', SENHA); await m.click('[data-testid=portal-entrar] button[type=submit]'); await m.waitForTimeout(4500)
await m.goto(PH + '/chamados/' + oid); await m.waitForSelector('[data-testid=conversa]'); await m.waitForTimeout(1500)
ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'portal no celular: conversa sem rolagem horizontal')
await m.screenshot({ path: N + '/e5a_celular.png', fullPage: true })

console.log('erros:', erros.filter(e => !/favicon/.test(e)))
limpar(); resumo(); await b.close()
