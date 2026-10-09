import { chromium } from 'playwright'
import { N, T, SB, anon, sql, ok, resumo } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const chamar = async body => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + anon, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() } }
sql(`delete from portal_solicitacoes_acesso where email like 'e3ts.%'`)
// servidor: sem token (ou token falso) é recusado
let r = await chamar({ acao: 'solicitar', tenant_id: T, nome: 'Robo', email: 'e3ts.robo@example.com', cliente: 'x' })
ok(r.s === 400 && /robô/.test(r.j.erro), 'servidor: pedido SEM verificação é recusado (400)')
r = await chamar({ acao: 'solicitar', tenant_id: T, nome: 'Robo', email: 'e3ts.robo@example.com', cliente: 'x', turnstile: 'token-falso-123' })
ok(r.s === 400, 'servidor: token falso é recusado pela Cloudflare (400)')
ok(sql(`select count(*)::int n from portal_solicitacoes_acesso where email='e3ts.robo@example.com'`)[0].n === 0, 'nada é gravado quando a verificação falha')
// tela: o widget aparece e, concluído, o pedido passa
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage(); const erros = []
p.on('pageerror', e => erros.push(e.message))
await p.goto(PH + '/solicitar-acesso'); await p.waitForSelector('[data-testid=form-solicitar]', { timeout: 20000 })
await p.waitForSelector('[data-testid=turnstile] iframe', { timeout: 20000 }).catch(() => {})
ok(await p.locator('[data-testid=turnstile]').count() === 1 && (await p.locator('[data-testid=turnstile]').boundingBox())?.height > 40, 'a verificação da Cloudflare aparece no formulário')
await p.fill('#sa-nome', 'E3TS Pessoa'); await p.fill('#sa-email', 'e3ts.pessoa@example.com'); await p.fill('#sa-cli', 'Cliente Trigger Teste')
await p.getByTestId('solicitar-enviar').click(); await p.waitForTimeout(800)
ok(await p.locator('text=Confirme que você não é um robô').count() > 0, 'tela: enviar sem concluir a verificação → "Confirme que você não é um robô"')
// tenta marcar a caixa do widget (posição dentro do contêiner)
const bb = await p.locator('[data-testid=turnstile]').boundingBox(); if (bb) await p.mouse.click(bb.x + 28, bb.y + 32)
let passou = false
for (let i = 0; i < 25; i++) {
  const val = await p.evaluate(() => (document.querySelector('[name="cf-turnstile-response"]') || {}).value || '')
  if (val) { passou = true; break }
  await p.waitForTimeout(1000)
}
console.log('widget concluiu sozinho no navegador automatizado?', passou)
if (passou) {
  await p.getByTestId('solicitar-enviar').click(); await p.waitForSelector('[data-testid=solicitacao-enviada]', { timeout: 15000 }).catch(() => {})
  ok(await p.getByTestId('solicitacao-enviada').count() === 1 && sql(`select count(*)::int n from portal_solicitacoes_acesso where email='e3ts.pessoa@example.com'`)[0].n === 1, 'com a verificação concluída, o pedido é aceito e gravado')
}
await p.screenshot({ path: N + '/turnstile.png' })
console.log('erros:', erros); sql(`delete from portal_solicitacoes_acesso where email like 'e3ts.%'`); resumo(); await b.close()
