import { chromium, devices } from 'playwright'
import fs from 'fs'
import { N, U, T, SB, anon, cred, sql, ok, resumo, entrar, token } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const MARIA = sql(`select user_id from portal_pessoas where email='portal.teste@example.com'`)[0].user_id
const gN1 = sql(`select id from grupos_atendimento where nome='Central N1'`)[0].id
sql(`delete from orders where title like 'E4IN %'; delete from os_categorias where nome like 'E4IN %'; update tenants set portal_abertura='{}' where id='${T}'; update clients set portal_ativo=true where name='Cliente Trigger Teste'`)
sql(`update portal_pessoas set celular='71988887777' where user_id='${MARIA}'`)
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal, grupo_padrao_id) values ('${T}','E4IN Rede', true, '{incidente,visita}', '${gN1}')`)
const cat = sql(`select id from os_categorias where nome='E4IN Rede'`)[0].id
const loc = sql(`select id from locations where client_id='${CLI}' limit 1`)[0].id
// chamado real, como a Maria, com foto e datas pedidas
const mt = await token(cred.portal)
const caminho = `${T}/${CLI}/${MARIA}/${crypto.randomUUID()}.png`
const up = await fetch(`${SB}/storage/v1/object/portal-anexos/${caminho}`, { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + mt, 'Content-Type': 'image/png' }, body: fs.readFileSync(N + '/foto1.png') })
ok(up.ok, 'a Supervisora envia a foto para a pasta dela (armazenamento privado)')
const rpc = async (nome, corpo, tok) => { const r = await fetch(`${SB}/rest/v1/rpc/${nome}`, { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); return r.json() }
const dt = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10) }
const ab = await rpc('portal_abrir_chamado', { p: { client_id: CLI, tipo: 'visita', categoria_id: cat, location_id: loc, titulo: 'E4IN Visita de rede', descricao: 'Preciso de uma visita para avaliar a rede.', preferencias: [{ data: dt(8), periodo: 'tarde' }, { data: dt(9), periodo: 'manha' }],
  anexos: [{ path: caminho, nome: 'rack.png', tipo: 'foto', mime: 'image/png', bytes: 120 }] } }, mt)
ok(ab.numero, 'chamado aberto pelo portal: ' + ab.numero)
const oid = ab.id
const b = await chromium.launch(); const erros = []
const nova = async o => { const p = await (await b.newContext(o ?? { viewport: { width: 1366, height: 900 } })).newPage(); p.on('pageerror', e => erros.push(e.message)); return p }

// ===== administrador: configuração
const ad = await nova(); await entrar(ad, cred.admin)
await ad.goto(U + '/configuracoes'); await ad.waitForSelector('[data-secao="portal-abertura"]', { timeout: 20000 })
if (!(await ad.getByTestId('portal-abertura-config').isVisible().catch(() => false))) await ad.locator('[data-secao="portal-abertura"]').click()
await ad.waitForSelector('[data-testid=portal-abertura-config]')
ok(await ad.locator('[data-tipo-config]').count() === 4, 'Configurações › Abertura de chamados: os 4 tipos')
await ad.waitForTimeout(2500)
ok(await ad.locator('[data-aviso-tipo="preventiva"]').count() === 1 && await ad.locator('[data-aviso-tipo="incidente"]').count() === 0, 'avisa os tipos sem nenhuma categoria visível (cliente não veria o cartão)')
ok(await ad.getByTestId('modo-matriz-info').count() === 1, 'empresa em matriz Impacto × Urgência: explica as duas perguntas do cliente')
await ad.getByTestId('tipo-ativo-preventiva').uncheck(); await ad.getByTestId('tipo-ativo-requisicao').uncheck()
await ad.locator('[aria-label="Nome do tipo incidente"]').fill('Reportar defeito'); await ad.locator('[aria-label="Descrição do tipo incidente"]').fill('Algo quebrou ou parou')
await ad.getByTestId('salvar-abertura').click(); await ad.waitForTimeout(2000)
const c = sql(`select portal_abertura a from tenants where id='${T}'`)[0].a
ok(c.tipos.incidente.rotulo === 'Reportar defeito' && c.tipos.preventiva.ativo === false, 'configuração dos tipos salva')
const cl = await nova(); await cl.goto(PH + '/entrar'); await cl.fill('#portal-email', cred.portal[0]); await cl.fill('#portal-senha', cred.portal[1]); await cl.click('[data-testid=portal-entrar] button[type=submit]'); await cl.waitForTimeout(4500)
await cl.goto(PH + '/abrir'); await cl.waitForSelector('[data-tipo]')
const t = await cl.locator('[data-tipo]').allInnerTexts()
ok(t.some(x => x.includes('Reportar defeito') && x.includes('Algo quebrou')) && !t.some(x => x.includes('preventiva') || x.includes('manutenção preventiva')), 'no portal: o tipo renomeado aparece e o desativado some')
// desativar todos → bloqueio
await ad.getByTestId('tipo-ativo-incidente').uncheck(); await ad.getByTestId('tipo-ativo-visita').uncheck(); await ad.getByTestId('salvar-abertura').click(); await ad.waitForTimeout(1800)
ok(await ad.locator('text=pelo menos um tipo').count() > 0, 'não deixa desativar todos os tipos')
sql(`update tenants set portal_abertura='{}' where id='${T}'`)

// ===== OS: origem, chamado do portal dentro da OS
await ad.goto(U + '/os?sit=todas&ori=portal&q=E4IN'); await ad.waitForTimeout(3500)
ok(await ad.locator('[data-origem-portal]').count() >= 1, 'lista de OS: filtro por origem "Portal do cliente" e selo "Portal"')
await ad.goto(U + '/os/' + oid); await ad.waitForSelector('[data-testid=info-portal]', { timeout: 20000 })
const info = await ad.getByTestId('info-portal').innerText()
ok(info.includes('Maria Teste (Portal)') && info.includes('portal.teste@example.com') && info.includes('71988887777'), 'detalhe da OS: solicitante com e-mail e celular (equipe interna)')
ok(await ad.getByTestId('preferencias-data').locator('li').count() === 2, 'as 2 datas pedidas pelo cliente')
await ad.waitForTimeout(2500)
ok(await ad.locator('[data-testid=anexos-cliente] img').first().evaluate(i => i.complete && i.naturalWidth > 0), 'a foto do cliente carrega para a equipe (endereço assinado)')
const wa = await ad.getByTestId('avisar-whatsapp').getAttribute('href')
ok(wa.includes('wa.me/5571988887777') && decodeURIComponent(wa).includes(ab.numero) && decodeURIComponent(wa).includes('/chamados/' + oid), '"Avisar pelo WhatsApp": mensagem pronta com o número e o link do chamado no portal')
await ad.locator('[data-testid=agendar-data-pedida]').first().click(); await ad.waitForTimeout(800)
const dataCampo = await ad.locator('#schedule-date').inputValue()
ok(dataCampo.startsWith(dt(8)) && dataCampo.endsWith('14:00'), '"Agendar nesta data": abre o agendamento já com a data e o período pedidos (' + dataCampo + ')')
ok(await ad.locator('[data-testid=agendado-cliente], input[type=checkbox]:checked').count() >= 1, '...com "a pedido do cliente" marcado')
await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3500)
const o = sql(`select status, agendado_pelo_cliente a from orders where id='${oid}'`)[0]
ok(o.status === 'agendada' && o.a === true, 'OS agendada a pedido do cliente (o prazo passa a ser a data)')
await cl.goto(PH + '/chamados/' + oid); await cl.waitForSelector('[data-testid=portal-chamado]'); await cl.waitForTimeout(1500)
ok(await cl.getByTestId('agendado-para').count() === 1, 'o cliente vê "Agendado" e a data no portal')
sql(`update orders set status='aberta', agendado_pelo_cliente=false where id='${oid}'`)

// ===== atendente e técnico
const at = await nova(); await entrar(at, cred.atendente)
await at.goto(U + '/os'); await at.waitForTimeout(2500); await at.getByTestId('sino').first().click(); await at.waitForSelector('[data-testid=sino-painel]')
ok((await at.locator('[data-testid=sino-painel]').innerText()).includes('novo chamado do portal'), 'sino do coordenador do grupo (Atendente): "novo chamado do portal"')
await at.locator('[data-aviso*="novo chamado do portal"]').first().click(); await at.waitForTimeout(3000)
ok(/\/os\/[0-9a-f-]{36}/.test(at.url()), 'tocar no aviso abre a OS')
await at.goto(U + '/os/' + oid); await at.waitForSelector('[data-testid=info-portal]', { timeout: 20000 })
ok((await at.getByTestId('info-portal').innerText()).includes('portal.teste@example.com'), 'Atendente também vê o contato do solicitante')
const tec = sql(`select id from users where email='${cred.tecnico[0]}'`)[0].id
sql(`update orders set technician_id='${tec}' where id='${oid}'`)
const tc = await nova({ ...devices['iPhone 13'] }); await entrar(tc, cred.tecnico)
await tc.goto(U + '/campo/os/' + oid); await tc.waitForSelector('[data-testid=info-portal]', { timeout: 20000 })
const ti = await tc.getByTestId('info-portal').innerText()
ok(ti.includes('Maria Teste (Portal)') && !ti.includes('portal.teste@example.com') && !ti.includes('71988887777'), 'técnico responsável vê só o NOME do solicitante (sem e-mail nem celular)')
await tc.waitForTimeout(2500)
ok(await tc.locator('[data-testid=anexos-cliente] img').count() === 1 && await tc.getByTestId('avisar-whatsapp').count() === 0 && await tc.locator('[data-testid=agendar-data-pedida]').count() === 0, 'técnico vê a foto do cliente, sem botão de WhatsApp nem de agendar')
ok(await tc.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'app do técnico sem rolagem horizontal')
await tc.screenshot({ path: N + '/e4_tecnico_info.png', fullPage: false })
// OS interna comum não mostra o cartão
const interna = sql(`insert into orders (tenant_id, client_id, title, tipo, priority) values ('${T}','${CLI}','E4IN interna','incidente','baixo') returning id`)[0].id
await ad.goto(U + '/os/' + interna); await ad.waitForTimeout(3500)
ok(await ad.getByTestId('info-portal').count() === 0, 'OS aberta pela equipe não mostra o cartão do portal')
console.log('erros:', erros.filter(e => !/favicon/.test(e)))
sql(`delete from orders where title like 'E4IN %'; delete from os_categorias where nome like 'E4IN %'; delete from storage.objects where bucket_id='portal-anexos' and name like '%/${MARIA}/%'`)
resumo(); await b.close()
