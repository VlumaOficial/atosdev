import { chromium, devices } from 'playwright'
import fs from 'fs'
const N = (process.env.ATOS_SCRATCH || '/tmp/atos-scratch')
const cred = JSON.parse(fs.readFileSync(N + '/.cred.json'))
const ATOS = 'https://atosdev.vluma.com.br', PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
let f = 0; const ok = (c, m) => { if (!c) f++; console.log((c ? 'OK  ' : 'FALHA ') + m) }
const b = await chromium.launch(); const erros = []
const nova = async (o = { viewport: { width: 1366, height: 850 } }) => {
  const p = await (await b.newContext(o)).newPage()
  p.on('pageerror', e => erros.push(e.message))
  p.on('response', r => { if (r.status() >= 400 && !/token\?grant_type/.test(r.url())) erros.push(r.status() + ' ' + r.url().slice(0, 120)) })
  return p
}
// 1. visitante no endereço do portal
let p = await nova()
await p.goto(PH + '/'); await p.waitForTimeout(5000)
ok(p.url().startsWith(PH) && await p.locator('[data-testid=portal-entrar]').count() > 0, 'endereço do portal abre a tela de entrar da Infoxtec')
ok(await p.locator('text=Bem-vindo de volta').count() === 0, 'o portal NÃO mostra o login do ATOS')
await p.goto(PH + '/login'); await p.waitForTimeout(3000)
ok(await p.locator('text=Bem-vindo de volta').count() === 0 && await p.locator('[data-testid=portal-entrar]').count() > 0, 'no endereço do portal, /login também é o portal (o painel do ATOS não existe ali)')
await p.goto(PH + '/os'); await p.waitForTimeout(3000)
ok(await p.locator('[data-testid=portal-entrar]').count() > 0, 'no endereço do portal, /os (painel) volta para o portal')
await p.goto(PH + '/termos/privacidade'); await p.waitForTimeout(3000)
ok((await p.locator('[data-testid=portal-termo]').innerText().catch(() => '')).includes('Aviso de privacidade'), 'termos públicos no endereço do portal')
ok(await p.locator('img[src*="portal-publico"]').count() > 0, 'logo da empresa no portal')

// 2. o ATOS continua sendo o ATOS
p = await nova()
await p.goto(ATOS + '/login'); await p.waitForTimeout(3500)
ok(await p.locator('text=Bem-vindo de volta').count() > 0, 'atosdev.vluma.com.br continua sendo o login do ATOS')

// 3. caminho interno: visitante é levado ao endereço oficial; equipe interna vê a prévia
await p.goto(ATOS + '/portal/infoxtec/termos/uso'); await p.waitForTimeout(6000)
ok(p.url().startsWith(PH + '/termos/uso'), 'visitante no caminho interno é levado ao endereço oficial (mantendo a página): ' + p.url())
const ad = await nova()
await ad.goto(ATOS + '/login'); await ad.fill('#email', cred.admin[0]); await ad.fill('#password', cred.admin[1]); await ad.click('button[type=submit]'); await ad.waitForTimeout(5000)
await ad.goto(ATOS + '/portal/infoxtec'); await ad.waitForTimeout(5000)
ok(ad.url().startsWith(ATOS) && await ad.locator('[data-testid=portal-previa-interna]').count() > 0, 'admin (equipe interna) mantém a prévia no caminho interno')

// 4. pessoa do portal, no celular, pelo endereço oficial
const po = await nova({ ...devices['iPhone 13'] })
await po.goto(PH + '/entrar'); await po.waitForTimeout(3000)
await po.fill('#portal-email', cred.portal[0]); await po.fill('#portal-senha', cred.portal[1]); await po.click('[data-testid=portal-entrar] button[type=submit]'); await po.waitForTimeout(5000)
if (await po.locator('[data-testid=portal-aceite]').count()) { await po.locator('[data-testid=aceite-obrigatorio]').check(); await po.locator('[data-testid=aceite-confirmar]').click(); await po.waitForTimeout(4000) }
ok(po.url().startsWith(PH) && await po.locator('[data-testid=portal-inicio]').count() > 0, 'pessoa do portal entra pelo endereço oficial e vê o início')
ok(await po.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal no celular')
await po.goto(ATOS + '/portal/infoxtec'); await po.waitForTimeout(6000)
ok(po.url().startsWith(PH), 'pessoa do portal no caminho interno do ATOS é levada ao endereço oficial')
await po.goto(ATOS + '/os'); await po.waitForTimeout(4000)
ok(po.url().includes('/login'), 'pessoa do portal no painel do ATOS → login (sem acesso)')
await po.screenshot({ path: N + '/portal_host_celular.png' })
// 5. esqueci a senha pelo endereço do portal
const es = await nova()
await es.goto(PH + '/esqueci-senha'); await es.fill('#portal-email-rec', cred.portal[0]); await es.getByRole('button', { name: 'Enviar link' }).click(); await es.waitForTimeout(3500)
ok(await es.locator('[data-testid=portal-esqueci-ok]').count() > 0, 'esqueci a senha pelo endereço do portal: pedido aceito')
console.log('erros:', erros.filter(e => !/favicon/.test(e)))
console.log(f ? f + ' FALHA(S)' : 'TUDO OK'); await b.close()
