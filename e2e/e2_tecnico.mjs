import { chromium, devices } from 'playwright'
import { N, U, T, cred, sql, ok, resumo, entrar } from './lib.mjs'
const b = await chromium.launch(); const erros = []
const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage()
p.on('pageerror', e => erros.push(e.message)); p.on('response', r => { if (r.status() >= 400 && !/token\?grant_type|\/rest\/v1\/rpc/.test(r.url())) erros.push(r.status() + ' ' + r.url().slice(0, 110)) })
const T1 = sql(`select id from users where email='${cred.tecnico[0]}'`)[0].id
const proprias = () => sql(`select count(*)::int n from orders where technician_id='${T1}' and (status not in ('concluida','cancelada') or updated_at >= now() - interval '30 days')`)[0].n
const antes = proprias()
await entrar(p, cred.tecnico); await p.waitForTimeout(2500)
ok(p.url().endsWith('/campo'), 'técnico entra no app de campo')
const todas = parseInt((await p.locator('button:has-text("Todas") p').first().innerText()))
ok(todas === antes, `regressão: "Todas" mostra as ${antes} OS dele (nada a mais, nada a menos) → ${todas}`)
await p.waitForSelector('[data-testid=fila-do-grupo]', { timeout: 15000 })
const fila = await p.getByTestId('fila-do-grupo').innerText()
ok(fila.includes('E2-UI fila do campo') && fila.includes('E2-UI sem grupo'), 'membro do Campo Interior (Assumir ligado) vê a fila: as 2 OS sem técnico do grupo')
ok(!fila.includes('E2-UI roteada'), 'não vê OS de outro grupo (Central N1)')
ok(await p.locator('[data-fila-os]').count() === 2, 'só as OS sem técnico do grupo — nenhuma de colega')
ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal no celular')
await p.screenshot({ path: N + '/e2_tecnico_fila.png', fullPage: true })
// assumir
const alvo = p.locator('[data-fila-os]', { hasText: 'E2-UI fila do campo' })
await alvo.getByTestId('assumir').click(); await p.waitForURL(/\/campo\/os\//, { timeout: 15000 }); await p.waitForTimeout(2500)
ok(sql(`select technician_id t from orders where title='E2-UI fila do campo'`)[0].t === T1, 'assumir: a OS passa para o técnico')
ok(await p.getByTestId('os-grupo').innerText().then(t => t.includes('Campo Interior')), 'OS mostra o grupo')
ok(await p.getByRole('button', { name: 'Iniciar atendimento' }).count() === 1, 'depois de assumir, o técnico tem as ações normais da OS (Iniciar atendimento)')
ok(await p.getByTestId('btn-transferir').count() === 1, 'técnico responsável vê o botão Transferir')
// transferir (técnico não vê a lista de membros: só grupo)
await p.getByTestId('btn-transferir').click(); await p.waitForSelector('[data-testid=modal-transferir]')
await p.getByTestId('confirmar-transferir').click(); await p.waitForTimeout(500)
ok(await p.locator('text=Escolha o grupo de destino').count() > 0, 'sem escolher destino → aviso')
const optR = await p.locator('#tr-grupo option', { hasText: 'Redes N2' }).getAttribute('value'); await p.selectOption('#tr-grupo', optR)
ok((await p.getByTestId('previsao-direcao').innerText()).includes('Devolução'), 'Campo → N2: "Devolução"')
await p.fill('#tr-motivo', 'Problema é de rede, não do local'); await p.getByTestId('confirmar-transferir').click()
await p.waitForURL(u => u.pathname === '/campo', { timeout: 15000 }); await p.waitForTimeout(3000)
const r = sql(`select g.nome gn, o.technician_id t, o.status from orders o join grupos_atendimento g on g.id=o.grupo_id where o.title='E2-UI fila do campo'`)[0]
ok(r.gn === 'Redes N2' && r.t === null, 'transferiu para o grupo Redes N2: a OS cai na fila de lá, sem técnico')
ok((await p.locator('body').innerText()).includes('E2-UI fila do campo') === false, 'a OS some do app do técnico que transferiu')
ok(proprias() === antes, 'regressão: o técnico voltou às mesmas OS de antes')
// OS na fila abre pelo detalhe com o botão Assumir
const osFila = sql(`select id from orders where title='E2-UI sem grupo'`)[0].id
await p.goto(U + '/campo/os/' + osFila); await p.waitForSelector('[data-testid=os-na-fila]', { timeout: 15000 })
ok(await p.getByTestId('assumir-os').count() === 1 && await p.getByRole('button', { name: 'Iniciar atendimento' }).count() === 0, 'OS da fila sem técnico: só "Assumir" (sem ações de status)')
// técnico NÃO acessa OS de outro grupo pelo endereço
const osOutro = sql(`select id from orders where title='E2-UI roteada pelo catálogo'`)[0].id
await p.goto(U + '/campo/os/' + osOutro); await p.waitForTimeout(3500)
ok((await p.locator('body').innerText()).includes('não atribuída a você') || (await p.locator('body').innerText()).includes('não encontrad'), 'OS de outro grupo pelo endereço: "não encontrada ou não atribuída a você"')
console.log('erros:', erros.filter(e => !/favicon/.test(e)))
resumo(); await b.close()
