import { chromium } from 'playwright'
import { N, U, T, cred, sql, ok, resumo, entrar } from './lib.mjs'
const b = await chromium.launch(); const erros = []
const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage()
p.on('pageerror', e => erros.push(e.message)); p.on('response', r => { if (r.status() >= 400 && !/token\?grant_type|\/rest\/v1\/rpc/.test(r.url())) erros.push(r.status() + ' ' + r.url().slice(0, 110)) })
await entrar(p, cred.atendente)
ok(p.url().includes('/os') && p.url().includes('gru=sem') && p.url().includes('tec=sem'), 'Atendente cai direto na fila de entrada (Novos sem grupo): ' + p.url().replace(U, ''))
await p.waitForSelector('[data-testid=filas]', { timeout: 15000 }); await p.waitForTimeout(2500)
const menu = (await p.locator('nav').first().innerText()).split('\n').map(x => x.trim()).filter(Boolean)
ok(menu.length === 1 && menu[0] === 'Ordens de Serviço', 'menu do Atendente: só "Ordens de Serviço" → ' + JSON.stringify(menu))
ok(await p.getByTestId('sino').count() >= 1, 'Atendente tem o sino de avisos')
ok((await p.locator('body').innerText()).includes('E2-UI sem grupo'), 'fila de entrada mostra as OS sem grupo e sem técnico')
for (const rota of ['/clientes', '/locais', '/grupos', '/sla', '/configuracoes', '/tecnicos', '/usuarios', '/checklists']) {
  await p.goto(U + rota); await p.waitForTimeout(1800)
  ok(!p.url().includes(rota) || p.url().includes('/os'), `rota ${rota} bloqueada para o Atendente → ${p.url().replace(U, '')}`)
}
// sino: aviso de transferência (coordenadora de Redes N2)
await p.goto(U + '/os'); await p.waitForTimeout(2500)
await p.getByTestId('sino').first().click(); await p.waitForSelector('[data-testid=sino-painel]')
const avisos = await p.locator('[data-testid=sino-painel]').innerText()
ok(/transferida para Redes N2/.test(avisos), 'sino: "transferida para Redes N2" chegou à coordenadora do grupo')
await p.locator('[data-aviso*="transferida para Redes N2"]').first().click(); await p.waitForTimeout(3000)
ok(/\/os\/[0-9a-f-]{36}/.test(p.url()), 'tocar no aviso abre a OS')
// transferir pela tela como Atendente (sem grupo → Campo Interior)
const osSem = sql(`select id from orders where title='E2-UI sem grupo'`)[0].id
await p.goto(U + '/os/' + osSem); await p.waitForSelector('[data-testid=btn-transferir]', { timeout: 15000 })
await p.getByTestId('btn-transferir').click(); await p.waitForSelector('[data-testid=modal-transferir]')
const optC = await p.locator('#tr-grupo option', { hasText: 'Campo Interior' }).getAttribute('value')
await p.selectOption('#tr-grupo', optC)
ok((await p.getByTestId('previsao-direcao').count()) === 0, 'sem grupo de origem não mostra direção (é encaminhamento)')
await p.fill('#tr-motivo', 'Encaminhando ao campo'); await p.getByTestId('confirmar-transferir').click(); await p.waitForTimeout(3500)
const r = sql(`select g.nome, o.technician_id, o.transferencias, (select direcao from os_transferencias where order_id=o.id order by em desc limit 1) d from orders o join grupos_atendimento g on g.id=o.grupo_id where o.id='${osSem}'`)[0]
ok(r.nome === 'Campo Interior' && r.technician_id === null && r.transferencias === 1 && r.d === 'encaminhamento', 'Atendente encaminhou a OS ao grupo Campo Interior (direção "encaminhamento", cai na fila)')
// editar o grupo pelo formulário da OS
await p.goto(U + '/os?sit=todas&q=E2-UI%20roteada'); await p.waitForTimeout(3000)
await p.locator('tr', { hasText: 'E2-UI roteada' }).locator('button').last().click(); await p.waitForSelector('#grupo-os')
await p.locator('#grupo-os').click(); await p.locator('[role=option]', { hasText: 'Central N1' }).first().click(); await p.waitForTimeout(500)
await p.getByRole('button', { name: /Salvar|Atualizar/ }).last().click(); await p.waitForTimeout(3000)
ok(sql(`select g.nome from orders o join grupos_atendimento g on g.id=o.grupo_id where o.title='E2-UI roteada pelo catálogo'`)[0].nome === 'Central N1', 'Atendente mudou o grupo pelo formulário da OS')
await p.screenshot({ path: N + '/e2_atendente.png', fullPage: true })
console.log('erros:', erros.filter(e => !/favicon/.test(e)))
resumo(); await b.close()
