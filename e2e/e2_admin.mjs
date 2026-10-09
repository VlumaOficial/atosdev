import { chromium } from 'playwright'
import { N, U, T, cred, sql, ok, resumo, entrar, token, rest } from './lib.mjs'
const b = await chromium.launch(); const erros = []
const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage()
p.on('pageerror', e => erros.push(e.message)); p.on('response', r => { if (r.status() >= 400 && !/token\?grant_type|\/rest\/v1\/rpc/.test(r.url())) erros.push(r.status() + ' ' + r.url().slice(0, 110)) })
// limpeza de execuções anteriores
sql(`delete from orders where title like 'E2-UI%'; delete from os_categorias where nome like 'E2-UI%'; delete from grupos_atendimento where nome like 'E2-UI%'; delete from users where email like 'e2ui.%'`)
sql(`update os_categorias set visivel_portal = null, tipos_portal = '{}', grupo_padrao_id = null where tenant_id='${T}'`)
await entrar(p, cred.admin)

// ---- grupos
await p.goto(U + '/grupos'); await p.waitForSelector('[data-testid=lista-grupos]', { timeout: 15000 })
ok(await p.locator('[data-grupo]').count() >= 3, 'tela Grupos de atendimento lista os grupos')
const campo = p.locator('[data-grupo="Campo Interior"]')
ok((await campo.innerText()).includes('Assumir ligado') && (await campo.innerText()).includes('Campo'), 'Campo Interior: nível Campo e "Assumir ligado"')
ok((await p.locator('[data-grupo="Central N1"]').innerText()).includes('Atendente Teste'), 'coordenação do Central N1 aparece (Atendente Teste)')
await p.getByTestId('novo-grupo').click(); await p.waitForSelector('[data-testid=form-grupo]')
await p.fill('#g-nome', 'Central N1'); await p.getByRole('button', { name: 'Salvar' }).last().click(); await p.waitForTimeout(2000)
ok(await p.locator('text=Já existe um grupo com este nome').count() > 0, 'nome de grupo repetido → mensagem amigável')
await p.fill('#g-nome', 'E2-UI Grupo Teste'); await p.selectOption('#g-nivel', 'n2')
await p.locator('[data-pessoa="Teste02"] input[type=checkbox]').first().check()
await p.locator('[data-pessoa="Administrador Infoxtec"] input[type=checkbox]').first().check()
ok(await p.locator('[data-testid="coord-Teste02"]').count() === 0, 'técnico não tem opção de coordenador')
ok(await p.locator('[data-testid="coord-Administrador Infoxtec"]').count() === 1, 'administrador tem opção de coordenador')
await p.locator('[data-testid="coord-Administrador Infoxtec"]').check()
await p.getByRole('button', { name: 'Salvar' }).last().click(); await p.waitForTimeout(2500)
const g = sql(`select g.nivel, (select count(*) from grupo_membros m where m.grupo_id=g.id) mem, (select count(*) from grupo_membros m where m.grupo_id=g.id and m.coordenador) co from grupos_atendimento g where nome='E2-UI Grupo Teste'`)[0]
ok(g && g.nivel === 'n2' && g.mem === 2 && g.co === 1, 'grupo criado pela tela com 2 membros e 1 coordenador')
await p.fill('#limite-transf', '4'); await p.getByRole('button', { name: 'Salvar' }).first().click(); await p.waitForTimeout(1500)
ok(sql(`select transferencias_limite l from tenants where id='${T}'`)[0].l === 4, 'limite de pingue-pongue salvo pela tela (4)')
sql(`update tenants set transferencias_limite = 3 where id='${T}'`)

// ---- catálogo
await p.goto(U + '/sla?aba=categorias'); await p.waitForSelector('[data-testid=banner-portal]', { timeout: 15000 })
const nSem = parseInt((await p.locator('[data-testid=banner-portal] b').innerText()))
ok(nSem >= 1, `banner avisa as ${nSem} categorias sem decisão sobre o portal`)
ok((await p.locator('[data-info-portal]').first().innerText()).includes('não definido'), 'categorias existentes mostram "Portal: não definido"')
await p.getByRole('button', { name: 'Definir o que aparece no portal' }).click(); await p.waitForSelector('[data-testid=assistente-portal]')
ok(await p.locator('[data-assist-cat]').count() === nSem, 'assistente lista todas as categorias sem decisão')
const primeira = p.locator('[data-assist-cat]').first()
await primeira.getByRole('button', { name: 'Sim' }).click()
await p.locator('[data-assist-cat]').nth(1).getByRole('button', { name: 'Não' }).click().catch(() => {})
await p.getByRole('button', { name: /^Salvar/ }).last().click(); await p.waitForTimeout(2500)
const dec = sql(`select count(*) filter (where visivel_portal is true) sim, count(*) filter (where visivel_portal is false) nao, count(*) filter (where visivel_portal is null) pend from os_categorias where tenant_id='${T}'`)[0]
ok(dec.sim >= 1 && dec.pend === nSem - dec.sim - dec.nao, `assistente gravou ${dec.sim} Sim e ${dec.nao} Não; o resto segue sem decisão`)
ok(sql(`select cardinality(tipos_portal) n from os_categorias where tenant_id='${T}' and visivel_portal is true limit 1`)[0].n === 4, 'categorias "Sim" ficam em todos os 4 tipos por padrão')
// nova categoria: Sim/Não obrigatório
await p.getByRole('button', { name: 'Nova categoria' }).click(); await p.fill('#cat-nome', 'E2-UI Categoria')
await p.getByRole('button', { name: 'Salvar' }).last().click(); await p.waitForTimeout(800)
ok(await p.locator('text=Escolha se a categoria aparece no portal').count() > 0, 'categoria nova exige a escolha Sim/Não (sem pré-marcação)')
ok(await p.getByTestId('visivel-sim').isChecked() === false && await p.getByTestId('visivel-nao').isChecked() === false, 'nenhuma opção vem pré-marcada')
await p.getByTestId('visivel-sim').check()
await p.getByTestId('tipo-incidente').check(); await p.getByTestId('tipo-visita').check()
await p.fill('#cat-desc', 'Teste de descrição para o cliente')
await p.selectOption('#cat-grupo', { label: 'Central N1' })
await p.getByRole('button', { name: 'Salvar' }).last().click(); await p.waitForTimeout(2500)
const c = sql(`select visivel_portal v, tipos_portal t, descricao_portal d, (select nome from grupos_atendimento where id=grupo_padrao_id) g from os_categorias where nome='E2-UI Categoria'`)[0]
ok(c && c.v === true && c.t.sort().join() === 'incidente,visita' && c.d.startsWith('Teste') && c.g === 'Central N1', 'ficha completa gravada (portal, 2 tipos, descrição, grupo padrão)')
ok((await p.locator('[data-categoria="E2-UI Categoria"]').innerText()).includes('Grupo: Central N1'), 'lista mostra o grupo padrão da categoria')

// ---- roteamento + filas + transferência
const tok = await token(cred.admin)
const cat = sql(`select id from os_categorias where nome='E2-UI Categoria'`)[0].id
const cli = sql(`select id from clients where tenant_id='${T}' limit 1`)[0].id
const gCampo = sql(`select id from grupos_atendimento where nome='Campo Interior'`)[0].id
const admId = sql(`select id from users where email='adm@infoxtec.com.br'`)[0].id
const o1 = (await rest(tok, 'orders', 'POST', { tenant_id: T, client_id: cli, title: 'E2-UI roteada pelo catálogo', tipo: 'incidente', priority: 'alto', created_by: admId, categoria_id: cat }))[0]
const o2 = (await rest(tok, 'orders', 'POST', { tenant_id: T, client_id: cli, title: 'E2-UI fila do campo', tipo: 'incidente', priority: 'alto', created_by: admId, grupo_id: gCampo }))[0]
const o3 = (await rest(tok, 'orders', 'POST', { tenant_id: T, client_id: cli, title: 'E2-UI sem grupo', tipo: 'incidente', priority: 'baixo', created_by: admId }))[0]
ok(o1.grupo_id === sql(`select id from grupos_atendimento where nome='Central N1'`)[0].id, 'OS criada com a categoria já nasce no grupo padrão (Central N1)')
await p.goto(U + '/os'); await p.waitForSelector('[data-testid=filas]', { timeout: 15000 }); await p.waitForTimeout(2500)
ok(await p.locator('[data-testid=fila-novos]').count() === 1 && (await p.locator('[data-testid=fila-novos]').innerText()).match(/\(\d+\)/), 'chip "Novos sem grupo" com contagem')
await p.getByTestId('fila-novos').click(); await p.waitForTimeout(2500)
let corpo = await p.locator('body').innerText()
ok(corpo.includes('E2-UI sem grupo') && !corpo.includes('E2-UI roteada') && !corpo.includes('E2-UI fila do campo'), 'fila "Novos sem grupo" mostra só OS sem grupo e sem técnico')
await p.getByTestId('fila-Campo Interior').click(); await p.waitForTimeout(2500)
corpo = await p.locator('body').innerText()
ok(corpo.includes('E2-UI fila do campo') && !corpo.includes('E2-UI sem grupo'), 'fila do grupo Campo Interior mostra a OS dele')
ok((await p.locator('[data-grupo-os]').first().innerText()) === 'Campo Interior', 'coluna Grupo preenchida')
await p.getByRole('button', { name: 'Ver todas' }).click(); await p.waitForTimeout(2000)

// transferir pela tela
await p.goto(U + '/os/' + o1.id); await p.waitForSelector('[data-testid=os-grupo]', { timeout: 15000 })
ok((await p.getByTestId('os-grupo').innerText()).includes('Central N1'), 'detalhe da OS mostra o grupo')
await p.getByTestId('btn-transferir').click(); await p.waitForSelector('[data-testid=modal-transferir]')
await p.getByTestId('confirmar-transferir').click(); await p.waitForTimeout(600)
ok(await p.locator('text=Escolha o grupo de destino').count() > 0, 'transferir sem destino → aviso')
await p.selectOption('#tr-grupo', { label: /Redes N2/ }.test ? undefined : undefined).catch(() => {})
const opt = await p.locator('#tr-grupo option', { hasText: 'Redes N2' }).getAttribute('value')
await p.selectOption('#tr-grupo', opt)
ok((await p.getByTestId('previsao-direcao').innerText()).includes('Escalonamento'), 'previsão da direção: N1 → N2 é escalonamento')
await p.getByTestId('confirmar-transferir').click(); await p.waitForTimeout(600)
ok(await p.locator('text=Informe o motivo').count() > 0, 'motivo é obrigatório')
await p.fill('#tr-motivo', 'Precisa de especialista em rede'); await p.getByTestId('confirmar-transferir').click(); await p.waitForTimeout(3500)
ok((await p.getByTestId('os-grupo').innerText()).includes('Redes N2') && (await p.getByTestId('os-grupo').innerText()).includes('1 transferência'), 'após transferir: grupo Redes N2 e "1 transferência"')
ok(await p.getByTestId('historico-transferencias').count() === 1 && (await p.getByTestId('historico-transferencias').innerText()).includes('Escalonamento'), 'histórico de transferências com a direção')
ok((await p.getByTestId('historico-transferencias').innerText()).includes('Tempo em cada grupo'), 'histórico mostra o tempo em cada grupo')
await p.locator('button:has-text("evento")').first().click(); await p.waitForTimeout(800)
ok((await p.locator('[data-evento-transferencia]').first().innerText()).includes('Central N1') && (await p.locator('body').innerText()).includes('Motivo: Precisa de especialista'), 'linha do tempo registra a transferência com o motivo')
await p.screenshot({ path: N + '/e2_detalhe.png', fullPage: true })

console.log('erros:', erros.filter(e => !/favicon/.test(e)))
resumo(); await b.close()
