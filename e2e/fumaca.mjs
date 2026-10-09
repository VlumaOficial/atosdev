import { chromium, devices } from 'playwright'
import { U, cred, ok, resumo, entrar } from './lib.mjs'
const b = await chromium.launch()
async function varrer(nome, ctxOpts, c, rotas) {
  const p = await (await b.newContext(ctxOpts)).newPage(); const erros = []
  p.on('pageerror', e => erros.push('JS: ' + e.message.slice(0, 100)))
  p.on('response', r => { if (r.status() >= 500) erros.push(r.status() + ' ' + r.url().slice(0, 100)) })
  await entrar(p, c)
  for (const [rota, texto] of rotas) {
    erros.length = 0
    await p.goto(U + rota); await p.waitForTimeout(3500)
    const corpo = await p.locator('body').innerText()
    ok(corpo.includes(texto) && erros.length === 0, `${nome} ${rota} abre e mostra "${texto}"${erros.length ? ' — ERROS: ' + erros.join(' | ') : ''}`)
  }
}
await varrer('admin', { viewport: { width: 1366, height: 900 } }, cred.admin, [
  ['/', 'Painel gerencial'], ['/os', 'Ordens de Serviço'], ['/clientes', 'Clientes'], ['/locais', 'Unidades'], ['/tecnicos', 'Técnicos'],
  ['/checklists', 'Checklists'], ['/checklists/avulsos', 'Checklists avulsos'], ['/sla', 'Catálogo'], ['/calendarios', 'Calendários'],
  ['/grupos', 'Grupos de atendimento'], ['/usuarios', 'Usuários'], ['/configuracoes', 'Portal de atendimento'],
])
await varrer('super admin', { viewport: { width: 1366, height: 900 } }, cred.super, [['/tenants', 'Empresas'], ['/configuracoes', 'Plataforma']])
await varrer('técnico', { ...devices['iPhone 13'] }, cred.tecnico, [['/campo', 'Atendimentos'], ['/campo/checklists', 'Checklists']])
resumo(); await b.close()
