// E5b parte 1 — pausa com o cliente ("Aguardando você"), previsão de retorno, motivos cadastráveis e reagendar pausando o SLA.
import { chromium, devices } from 'playwright'
import { N, U, T, SB, anon, cred, sql, ok, resumo, token, entrar } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const admTok = await token(cred.admin)
const SENHA = 'Senha-E5b-1234'
const acesso = async (tok, body) => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json() }
const linkTeste = () => sql(`select detalhe->>'link_teste' l from portal_auditoria where detalhe->>'link_teste' is not null order by id desc limit 1`)[0]?.l
const limpar = () => sql(`delete from orders where title like 'E5B %'; delete from motivos_pausa where nome like 'E5B %'; delete from os_categorias where nome like 'E5B %'; delete from auth.users where email like 'e5b.%'; delete from portal_pessoas where email like 'e5b.%'; delete from portal_convites where email like 'e5b.%'; update tenants set sla_limite_reagendamentos = 3 where id='${T}'`)
limpar()
sql(`update tenants set portal_abertura='{}' where id='${T}'`)
sql(`update clients set portal_ativo = true where name='Cliente Trigger Teste'`)
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal) values ('${T}','E5B Rede', true, '{incidente}')`)
const cat = sql(`select id from os_categorias where nome='E5B Rede'`)[0].id
const uid = await (async () => {
  await acesso(admTok, { acao: 'convidar', client_id: CLI, email: 'e5b.ana@example.com', nome: 'E5B Ana', perfil: 'usuario' })
  await acesso(null, { acao: 'aceitar', token: linkTeste().split('/convite/')[1], nome: 'E5B Ana', senha: SENHA })
  const u = sql(`select user_id from portal_pessoas where email='e5b.ana@example.com'`)[0].user_id
  sql(`insert into termos_aceites (user_id, tenant_id, termo_id, canal) select '${u}','${T}', x.id, 'portal' from portal_termos_vigentes('${T}') x`)
  return u
})()
const anaTok = await token(['e5b.ana@example.com', SENHA])
const aberto = await (await fetch(SB + '/rest/v1/rpc/portal_abrir_chamado', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + anaTok, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p: { client_id: CLI, tipo: 'incidente', categoria_id: cat, titulo: 'E5B roteador fora do ar', descricao: 'O roteador da recepção está fora do ar desde cedo', impacto: 'alto', urgencia: 'alta', compartilhado: false } }) })).json()
const oid = aberto.id
const tec = sql(`select id from users where email='${cred.tecnico[0]}'`)[0].id
sql(`update orders set technician_id='${tec}', status='em_andamento', started_at=now() where id='${oid}'`)
ok(!!oid, 'chamado aberto e em andamento: ' + aberto.numero)
const mot = n => sql(`select id from motivos_pausa where tenant_id='${T}' and nome='${n}'`)[0].id
const M_ACIONA = mot('Aguardando o cliente'), M_COMUNICA = mot('Aguardando peça ou material'), M_INTERNO = mot('Outro')
const local = d => { const x = new Date(Date.now() + d * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}T10:00` }

const b = await chromium.launch(); const erros = []
const nova = async (opts = { viewport: { width: 1366, height: 950 } }) => { const p = await (await b.newContext(opts)).newPage(); p.on('pageerror', e => erros.push(e.message)); p.on('response', r => { if (r.status() >= 400 && !/token\?grant_type|\/rest\/v1\/rpc|favicon|\/rest\/v1\/(orders|motivos_pausa)/.test(r.url())) erros.push(r.status() + ' ' + r.url().slice(0, 110)) }); return p }
const ad = await nova(); await entrar(ad, cred.admin)

// ===== motivos cadastráveis =====
await ad.goto(U + '/sla'); await ad.waitForTimeout(2500)
await ad.getByRole('tab', { name: /Motivos de pausa/ }).click().catch(async () => { await ad.locator('text=Motivos de pausa').first().click() })
await ad.waitForSelector('[data-testid=aba-pausas]', { timeout: 15000 }); await ad.waitForTimeout(1200)
ok((await ad.locator('[data-motivo="Aguardando o cliente"] [data-testid=comportamento]').inputValue()) === 'aciona', 'motivos: "Aguardando o cliente" aparece como "Aciona o cliente"')
ok((await ad.locator('[data-motivo="Aguardando peça ou material"] [data-testid=comportamento]').inputValue()) === 'comunica' && await ad.locator('[data-motivo="Aguardando peça ou material"] input[type=checkbox][aria-label^="Exige previsão"]').isChecked(), 'motivos: "peça ou material" comunica e exige previsão')
ok((await ad.locator('[data-motivo="Outro"] [data-testid=comportamento]').inputValue()) === 'interno', 'motivos: "Outro" é interno')
await ad.fill('[data-testid=novo-motivo] input[aria-label="Novo motivo"]', 'E5B Aguardando fornecedor')
await ad.selectOption('[data-testid=novo-motivo] select[aria-label="Comportamento do novo motivo"]', 'comunica')
await ad.fill('[data-testid=novo-motivo] input[aria-label^="Texto para o cliente"]', 'Aguardando o fornecedor')
await ad.locator('[data-testid=novo-motivo] label', { hasText: 'Exige previsão' }).locator('input').check()
await ad.locator('[data-testid=novo-motivo] button', { hasText: 'Adicionar' }).click(); await ad.waitForTimeout(2000)
const nm = sql(`select comportamento, texto_cliente, exige_previsao from motivos_pausa where nome='E5B Aguardando fornecedor'`)[0]
ok(nm && nm.comportamento === 'comunica' && nm.texto_cliente === 'Aguardando o fornecedor' && nm.exige_previsao, 'o admin CADASTRA um motivo novo com comportamento, texto e previsão')
await ad.fill('[data-testid=limite-reagendamentos] input[type=number]', '2'); await ad.locator('[data-testid=limite-reagendamentos] button', { hasText: 'Salvar' }).click(); await ad.waitForTimeout(1500)
ok(sql(`select sla_limite_reagendamentos l from tenants where id='${T}'`)[0].l === 2, 'o admin define o limite de agendamentos a pedido do cliente por chamado')

// ===== pausa que ACIONA o cliente =====
await ad.goto(U + '/os/' + oid); await ad.waitForSelector('[data-testid=conversa-os]', { timeout: 20000 }); await ad.waitForTimeout(1500)
await ad.getByRole('button', { name: 'Pausar' }).click(); await ad.waitForSelector('#motivo-pausa')
await ad.selectOption('#motivo-pausa', M_ACIONA); await ad.waitForTimeout(500)
ok(await ad.getByTestId('pausa-mensagem').count() === 1 && (await ad.getByTestId('pausa-o-que-cliente-ve').innerText()).includes('Aguardando sua resposta'), 'pausar "aciona": pede a mensagem ao cliente e explica o que ele verá')
await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(800)
ok((await ad.locator('[role=dialog]').innerText()).includes('mensagem ao cliente'), 'sem a mensagem → aviso claro, nada é salvo')
ok(sql(`select status from orders where id='${oid}'`)[0].status === 'em_andamento', 'a OS continua em andamento')
await ad.getByTestId('pausa-mensagem').fill('Precisamos que alguém libere o acesso à sala do rack para trocar o roteador.')
await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3500)
const o1 = sql(`select status, aguardando_cliente_desde is not null a, sla_pausado_desde is not null s from orders where id='${oid}'`)[0]
ok(o1.status === 'pausada' && o1.a && o1.s, 'banco: pausada, "aguardando o cliente desde…" e o relógio do SLA parado')
ok((await ad.getByTestId('aguardando-cliente-os').innerText()).includes('Aguardando o cliente desde'), 'a ficha da OS mostra "Aguardando o cliente desde…"')

// ===== cliente: Aguardando você =====
const an = await nova(); await an.goto(PH + '/entrar'); await an.fill('#portal-email', 'e5b.ana@example.com'); await an.fill('#portal-senha', SENHA); await an.click('[data-testid=portal-entrar] button[type=submit]'); await an.waitForTimeout(4500)
await an.goto(PH + '/'); await an.waitForSelector('[data-testid=resumo-chamados]', { timeout: 20000 }); await an.waitForTimeout(2000)
ok((await an.getByTestId('card-aguardando-voce').innerText()).includes('1 chamado aguarda a sua resposta'), 'início do portal: "1 chamado aguarda a sua resposta"')
await an.goto(PH + '/chamados'); await an.waitForTimeout(2500)
ok(await an.locator('[data-chamado]').first().locator('[data-testid=aguardando-voce]').count() === 1 || await an.locator('[data-testid=aguardando-voce]').count() >= 1, 'a lista mostra o selo "Aguardando você"')
await an.goto(PH + '/chamados/' + oid); await an.waitForSelector('[data-testid=banner-aguardando-voce]', { timeout: 20000 }); await an.waitForTimeout(1000)
ok((await an.getByTestId('pedido-da-empresa').innerText()).includes('libere o acesso à sala do rack'), 'o chamado mostra o banner com o que a empresa pede')
ok(await an.getByTestId('mensagem-texto').getAttribute('placeholder').then(p => /retomar/.test(p)), 'o campo de resposta convida a responder para a empresa retomar')
await an.getByTestId('mensagem-texto').fill('Acesso liberado, podem vir a qualquer hora hoje.'); await an.getByTestId('enviar-mensagem').click(); await an.waitForTimeout(5000)
const o2 = sql(`select status, aguardando_cliente_desde is null a, sla_pausado_desde is null s from orders where id='${oid}'`)[0]
ok(o2.status === 'em_andamento' && o2.a && o2.s, 'a resposta do cliente retomou a OS sozinha e o relógio do SLA voltou')
await an.reload(); await an.waitForSelector('[data-testid=conversa]', { timeout: 20000 }); await an.waitForTimeout(1500)
ok(await an.getByTestId('banner-aguardando-voce').count() === 0 && await an.getByTestId('aguardando-voce').count() === 0, 'o banner e o selo "Aguardando você" somem')
await ad.reload(); await ad.waitForTimeout(2500)
ok((await ad.locator('body').innerText()).includes('Em andamento'), 'a equipe vê a OS de volta em "Em andamento"')

// ===== pausa que COMUNICA =====
await ad.getByRole('button', { name: 'Pausar' }).click(); await ad.waitForSelector('#motivo-pausa')
await ad.selectOption('#motivo-pausa', M_COMUNICA); await ad.waitForTimeout(500)
ok(await ad.getByTestId('pausa-previsao').count() === 1 && await ad.getByTestId('pausa-mensagem').count() === 0, 'pausar "comunica": pede a previsão (e não a mensagem)')
await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(800)
ok((await ad.locator('[role=dialog]').innerText()).includes('previsão'), 'sem a previsão → aviso claro')
await ad.getByTestId('pausa-previsao').fill(local(3)); await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3500)
ok(sql(`select status, previsao_retorno is not null p, aguardando_cliente_desde is null a from orders where id='${oid}'`)[0].p, 'banco: pausada com a previsão de retorno')
await an.goto(PH + '/chamados/' + oid); await an.waitForSelector('[data-testid=banner-pausa]', { timeout: 20000 }); await an.waitForTimeout(800)
ok((await an.getByTestId('banner-pausa').innerText()).includes('Em pausa: Aguardando peça ou material') && (await an.getByTestId('previsao-retorno').innerText()).includes('Previsão de retorno'), 'o cliente vê "Em pausa: …" com a previsão de retorno')
ok(await an.getByTestId('aguardando-voce').count() === 0, 'e NÃO aparece "Aguardando você" (só comunica)')
await new Promise(r => setTimeout(r, 6000))
ok(sql(`select count(*)::int n from portal_avisos where order_id='${oid}' and evento like 'pausa:%'`)[0].n >= 1, 'e-mail "chamado em pausa" foi disparado pelo banco')
// retomar e pausar com o motivo NOVO (cadastrado pelo admin)
await ad.reload(); await ad.waitForTimeout(2000)
await ad.getByRole('button', { name: 'Retomar' }).click(); await ad.waitForTimeout(3000)
ok(sql(`select status, previsao_retorno is null p from orders where id='${oid}'`)[0].p, 'ao retomar, a previsão é limpa')
await ad.getByRole('button', { name: 'Pausar' }).click(); await ad.waitForSelector('#motivo-pausa')
const novoId = sql(`select id from motivos_pausa where nome='E5B Aguardando fornecedor'`)[0].id
await ad.selectOption('#motivo-pausa', novoId); await ad.waitForTimeout(400)
ok(await ad.getByTestId('pausa-previsao').count() === 1, 'o motivo NOVO também pede previsão (cadastro vale na tela de pausar)')
await ad.getByTestId('pausa-previsao').fill(local(2)); await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3000)
await an.reload(); await an.waitForSelector('[data-testid=banner-pausa]', { timeout: 20000 })
ok((await an.getByTestId('banner-pausa').innerText()).includes('Em pausa: Aguardando o fornecedor'), 'o cliente vê o texto do motivo novo')
await ad.reload(); await ad.waitForTimeout(2000); await ad.getByRole('button', { name: 'Retomar' }).click(); await ad.waitForTimeout(2500)

// ===== pausa interna =====
await ad.getByRole('button', { name: 'Pausar' }).click(); await ad.waitForSelector('#motivo-pausa'); await ad.selectOption('#motivo-pausa', M_INTERNO); await ad.waitForTimeout(400)
ok((await ad.getByTestId('pausa-o-que-cliente-ve').innerText()).includes('Em andamento'), 'pausar "interno": explica que o cliente continua vendo "Em andamento"')
await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3000)
await an.reload(); await an.waitForSelector('[data-testid=conversa]', { timeout: 20000 }); await an.waitForTimeout(1000)
ok(await an.getByTestId('banner-pausa').count() === 0 && await an.getByTestId('banner-aguardando-voce').count() === 0, 'pausa interna: o cliente não vê pausa nenhuma')
await ad.reload(); await ad.waitForTimeout(2000); await ad.getByRole('button', { name: 'Retomar' }).click(); await ad.waitForTimeout(2500)

// ===== técnico no app =====
const tc = await nova({ ...devices['iPhone 13'] }); await entrar(tc, cred.tecnico)
await tc.goto(U + '/campo/os/' + oid); await tc.waitForSelector('[data-testid=conversa-os]', { timeout: 20000 }); await tc.waitForTimeout(1500)
await tc.getByRole('button', { name: /Pausar/ }).click(); await tc.waitForSelector('#motivo-pausa'); await tc.selectOption('#motivo-pausa', M_ACIONA); await tc.waitForTimeout(500)
ok(await tc.getByTestId('pausa-mensagem').count() === 1, 'app do técnico: pausar "aciona" também pede a mensagem ao cliente')
ok(await tc.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'app do técnico sem rolagem horizontal')
await tc.keyboard.press('Escape')

// ===== reagendar pausando o SLA =====
const antes = sql(`select sla_base, prazo_solucao, reagendamentos r from orders where id='${oid}'`)[0]
await ad.reload(); await ad.waitForTimeout(2000)
await ad.getByRole('button', { name: 'Agendar' }).click(); await ad.waitForSelector('#schedule-date')
await ad.fill('#schedule-date', local(6)); await ad.fill('#reason', 'Cliente sem disponibilidade hoje')
await ad.getByLabel('Agendado a pedido do cliente').check(); await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3500)
const s1 = sql(`select status, sla_base, prazo_solucao, sla_agend_min m, reagendamentos r from orders where id='${oid}'`)[0]
ok(s1.status === 'agendada' && s1.r === 1 && s1.m > 0 && s1.sla_base === antes.sla_base && s1.prazo_solucao > antes.prazo_solucao, 'agendar a pedido do cliente: SLA pausado até a data (base intacta, prazo andou)')
ok(await ad.getByRole('button', { name: 'Reagendar' }).count() === 1, 'a OS agendada tem o botão "Reagendar"')
await ad.getByRole('button', { name: 'Reagendar' }).click(); await ad.waitForSelector('#schedule-date')
ok(await ad.getByLabel('Agendado a pedido do cliente').isChecked(), 'Reagendar já vem marcado "a pedido do cliente" (como o agendamento anterior)')
await ad.fill('#schedule-date', local(9)); await ad.fill('#reason', 'Cliente pediu outra data'); await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3500)
const s2 = sql(`select status, sla_agend_min m, reagendamentos r, prazo_solucao from orders where id='${oid}'`)[0]
ok(s2.status === 'agendada' && s2.r === 2 && s2.m > s1.m && s2.prazo_solucao > s1.prazo_solucao, 'reagendar: o crédito foi refeito (2º agendamento) e o prazo andou de novo')
await ad.getByRole('button', { name: 'Reagendar' }).click(); await ad.waitForSelector('#schedule-date')
await ad.fill('#schedule-date', local(12)); await ad.fill('#reason', 'Mais uma vez'); await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3000)
ok((await ad.locator('[role=dialog]').innerText()).includes('limite'), 'o 3º agendamento é recusado pelo limite (2) com mensagem clara')
await an.goto(PH + '/chamados/' + oid); await an.waitForSelector('[data-testid=conversa]', { timeout: 20000 }); await an.waitForTimeout(1500)
ok((await an.getByTestId('linha-do-tempo').innerText()).includes('agendado'), 'o cliente vê o agendamento no andamento')

console.log('erros:', erros.filter(e => !/favicon/.test(e)))
limpar(); resumo(); await b.close()
