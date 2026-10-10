import { chromium, devices } from 'playwright'
import fs from 'fs'
const S = (process.env.ATOS_SCRATCH || '/tmp/atos-scratch')
const cred = JSON.parse(fs.readFileSync(S + '/.cred.json'))
const U = 'https://atosdev.vluma.com.br'
let f = 0; const ok = (c, m) => { if (!c) f++; console.log((c ? 'OK  ' : 'FALHA ') + m) }
const b = await chromium.launch()
async function entrar(ctxOpts, c) {
  const p = await (await b.newContext(ctxOpts)).newPage()
  await p.goto(U + '/login'); await p.waitForSelector('#email', { timeout: 15000 })
  await p.fill('#email', c[0]); await p.fill('#password', c[1]); await p.click('button[type=submit]'); await p.waitForTimeout(5000)
  return p
}
let p = await (await b.newContext({ viewport: { width: 1366, height: 800 } })).newPage()
await p.goto(U + '/login'); await p.waitForTimeout(3500)
ok(await p.locator('text=Bem-vindo de volta').count() > 0, 'atosdev.vluma.com.br/login mostra o login do ATOS')
await p.goto(U + '/'); await p.waitForTimeout(3000)
ok(p.url().includes('/login'), 'raiz sem sessão → login do ATOS')
p = await entrar({ viewport: { width: 1366, height: 800 } }, cred.admin)
ok(!p.url().includes('/login') && await p.locator('text=Painel gerencial').count() > 0, 'admin entra no painel gerencial')
p = await entrar({ ...devices['iPhone 13'] }, cred.tecnico)
ok(p.url().endsWith('/campo'), 'técnico (celular) entra no app de campo')
p = await entrar({ viewport: { width: 1366, height: 800 } }, cred.super)
ok(!p.url().includes('/login'), 'Super Admin entra')
const q = await (await b.newContext()).newPage()
await q.goto(U + '/portal/infoxtec/entrar'); await q.waitForSelector('[data-testid=portal-entrar]', { timeout: 20000 }).catch(() => {})
ok(await q.locator('[data-testid=portal-entrar]').count() > 0, 'caminho interno do portal continua funcionando')
await b.close(); console.log(f ? f + ' FALHA(S)' : 'TUDO OK')
