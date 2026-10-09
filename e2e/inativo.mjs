import { chromium } from 'playwright'
import { U, SB, anon, cred, sql, ok, resumo, token, rest, entrar } from './lib.mjs'
const E = ['e2ui.atendente@example.com', 'Senha-E2ui-123']
sql(`update users set active=false where email='${E[0]}'`)
const tok = await token(E)
const os = await rest(tok, 'orders?select=id&limit=3')
ok(Array.isArray(os) && os.length === 0, 'desativado: mesmo com login válido, a API não devolve nenhuma OS')
const gr = await rest(tok, 'grupos_atendimento?select=id')
ok(Array.isArray(gr) && gr.length === 0, 'desativado: não lê grupos')
const b = await chromium.launch(); const p = await (await b.newContext()).newPage()
await p.goto(U + '/login'); await p.fill('#email', E[0]); await p.fill('#password', E[1]); await p.click('button[type=submit]'); await p.waitForTimeout(4000)
ok(p.url().includes('/login') && await p.locator('text=Seu acesso está desativado').count() > 0, 'tela de login: "Seu acesso está desativado. Fale com o administrador da sua empresa."')
// sessão já aberta é derrubada ao desativar
sql(`update users set active=true where email='${E[0]}'`)
const q = await (await b.newContext()).newPage()
await entrar(q, E); ok(q.url().includes('/os'), 'reativado: entra normalmente')
sql(`update users set active=false where email='${E[0]}'`)
await q.reload(); await q.waitForTimeout(4000)
ok(q.url().includes('/login'), 'sessão aberta: ao recarregar depois da desativação, é levado ao login')
sql(`update users set active=true where email='${E[0]}'`)
// regressão: contas ativas seguem normais
const a = await (await b.newContext()).newPage(); await entrar(a, cred.admin)
ok(await a.locator('text=Painel gerencial').count() > 0, 'regressão: admin ativo entra no painel gerencial')
await b.close(); resumo()
