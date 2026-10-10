// E5c — Resolvido → Fechado, "não foi resolvido" (reabrir), novo chamado ligado, assinatura do solicitante e relatório.
import { chromium, devices } from 'playwright'
import { N, U, T, SB, anon, cred, sql, ok, resumo, token, entrar } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const admTok = await token(cred.admin)
const SENHA = 'Senha-E5c-1234'
const acesso = async (tok, body) => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json() }
const linkTeste = () => sql(`select detalhe->>'link_teste' l from portal_auditoria where detalhe->>'link_teste' is not null order by id desc limit 1`)[0]?.l
const limpar = () => sql(`delete from orders where title like 'E5C %'; delete from os_categorias where nome like 'E5C %'; delete from auth.users where email like 'e5c.%'; delete from portal_pessoas where email like 'e5c.%'; delete from portal_convites where email like 'e5c.%'; update tenants set fechamento_dias_uteis = 3 where id='${T}'`)
limpar()
sql(`update tenants set portal_abertura='{}', fechamento_dias_uteis = 3 where id='${T}'`)
sql(`update clients set portal_ativo = true where id='${CLI}'`)
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal) values ('${T}','E5C Rede', true, '{incidente}')`)
const cat = sql(`select id from os_categorias where nome='E5C Rede'`)[0].id
await acesso(admTok, { acao: 'convidar', client_id: CLI, email: 'e5c.ana@example.com', nome: 'E5C Ana', perfil: 'usuario' })
await acesso(null, { acao: 'aceitar', token: linkTeste().split('/convite/')[1], nome: 'E5C Ana', senha: SENHA })
const uid = sql(`select user_id from portal_pessoas where email='e5c.ana@example.com'`)[0].user_id
sql(`insert into termos_aceites (user_id, tenant_id, termo_id, canal) select '${uid}','${T}', x.id, 'portal' from portal_termos_vigentes('${T}') x`)
const anaTok = await token(['e5c.ana@example.com', SENHA])
const tec = sql(`select id from users where email='${cred.tecnico[0]}'`)[0].id
const abrir = async titulo => (await (await fetch(SB + '/rest/v1/rpc/portal_abrir_chamado', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + anaTok, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p: { client_id: CLI, tipo: 'incidente', categoria_id: cat, titulo, descricao: 'O link de internet da loja está instável desde cedo', impacto: 'alto', urgencia: 'alta', compartilhado: false } }) })).json())
const andamento = id => sql(`update orders set technician_id='${tec}', status='em_andamento', started_at=now(), require_signature=false where id='${id}'`)
const oA = await abrir('E5C chamado com assinatura'); const oB = await abrir('E5C chamado confirmado'); const oC = await abrir('E5C chamado nao resolvido')
for (const o of [oA, oB, oC]) andamento(o.id)
ok(!!oA.id && !!oB.id && !!oC.id, 'três chamados do portal em andamento: ' + [oA, oB, oC].map(o => o.numero).join(', '))

const b = await chromium.launch(); const erros = []
const nova = async (opts = { viewport: { width: 1366, height: 950 } }) => { const p = await (await b.newContext(opts)).newPage(); p.on('pageerror', e => erros.push(e.message)); return p }
const ad = await nova(); await entrar(ad, cred.admin)
const an = await nova(); await an.goto(PH + '/entrar'); await an.fill('#portal-email', 'e5c.ana@example.com'); await an.fill('#portal-senha', SENHA); await an.click('[data-testid=portal-entrar] button[type=submit]'); await an.waitForTimeout(4500)
const ver = async id => { await an.goto(PH + '/chamados/' + id); await an.waitForSelector('[data-testid=conversa]', { timeout: 20000 }); await an.waitForTimeout(1500) }
const desenhar = async page => { const cs = page.locator('[role=dialog] canvas'); const n = await cs.count(); for (let i = 0; i < n; i++) { const bb = await cs.nth(i).boundingBox(); if (!bb) continue; await page.mouse.move(bb.x + 20, bb.y + 20); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height - 15, { steps: 6 }); await page.mouse.move(bb.x + bb.width - 20, bb.y + 20, { steps: 6 }); await page.mouse.up() } }

// ===== A: a equipe conclui com a assinatura do SOLICITANTE =====
await ad.goto(U + '/os/' + oA.id); await ad.waitForSelector('[data-testid=conversa-os]', { timeout: 20000 }); await ad.waitForTimeout(1500)
await ad.getByRole('button', { name: 'Concluir', exact: true }).click(); await ad.waitForSelector('[data-testid=quem-assina]', { timeout: 15000 })
ok((await ad.getByTestId('quem-assina').innerText()).includes('E5C Ana') && await ad.getByTestId('assina-solicitante').isChecked(), 'Concluir: "Quem está assinando?" já vem com o solicitante (E5C Ana)')
await ad.locator('#relato').fill('Trocamos o roteador e o link voltou a ficar estável.'); await desenhar(ad)
await ad.getByRole('button', { name: 'Concluir atendimento' }).click(); await ad.waitForTimeout(6000)
const a1 = sql(`select status, fechada_em is not null f, fechamento_tipo t, assinou_solicitante a, signer_name from orders where id='${oA.id}'`)[0]
ok(a1.status === 'concluida' && a1.f && a1.t === 'assinatura' && a1.signer_name === 'E5C Ana', 'banco: concluída e já FECHADA pela assinatura do solicitante (assinou: E5C Ana)', JSON.stringify(a1))
await ver(oA.id)
ok((await an.getByTestId('resolucao').getAttribute('data-fechado')) === 'sim' && (await an.getByTestId('resolucao').innerText()).includes('a sua assinatura em campo confirmou a solução'), 'portal: "Chamado fechado — a sua assinatura em campo confirmou a solução"')
ok(await an.getByTestId('confirmar-solucao').count() === 0 && await an.getByTestId('abrir-relacionado').count() === 1, 'fechado: não pede confirmação e oferece "Abrir novo chamado relacionado"')
await ad.reload(); await ad.waitForSelector('[data-testid=info-portal]', { timeout: 20000 }); await ad.waitForTimeout(1500)
ok((await ad.getByTestId('fechada-os').innerText()).includes('assinatura do solicitante'), 'a ficha da OS mostra "fechado — assinatura do solicitante valeu como confirmação"')

// ===== novo chamado ligado =====
await an.getByTestId('abrir-relacionado').click(); await an.waitForSelector('[data-testid=banner-relacionado]', { timeout: 20000 })
ok((await an.getByTestId('banner-relacionado').innerText()).includes(oA.numero), 'abrir relacionado: o banner mostra a que chamado ele fica ligado')
await an.locator('[data-tipo=incidente]').click(); await an.selectOption('#ab-assunto', { label: 'E5C Rede' })
await an.getByRole('radio').first().isVisible().catch(() => {})
await an.fill('#ab-titulo', 'E5C o problema voltou'); await an.fill('#ab-desc', 'O mesmo problema de internet voltou a acontecer hoje à tarde')
await an.getByRole('button', { name: /Todo mundo|A empresa toda/ }).first().click().catch(() => {})
const imp = an.locator('[data-impacto]'); if (await imp.count()) await imp.last().click()
await an.waitForTimeout(500)
await an.getByTestId('enviar-chamado').click(); await an.waitForTimeout(500)
if (await an.getByTestId('erro-abrir').count()) { await an.locator('[data-impacto="alto"]').click().catch(() => {}); await an.locator('[data-urgencia="alta"]').click().catch(() => {}); await an.getByTestId('enviar-chamado').click() }
await an.waitForTimeout(5000)
const rel = sql(`select relacionada_a from orders where title='E5C o problema voltou'`)[0]
ok(rel && rel.relacionada_a === oA.id, 'banco: o novo chamado nasce "relacionado a" ' + oA.numero)

// ===== B: o cliente CONFIRMA a solução =====
await ad.goto(U + '/os/' + oB.id); await ad.waitForSelector('[data-testid=conversa-os]', { timeout: 20000 }); await ad.waitForTimeout(1500)
await ad.getByRole('button', { name: 'Concluir', exact: true }).click(); await ad.waitForSelector('#relato', { timeout: 15000 })
await ad.locator('#relato').fill('Reiniciamos o modem e ajustamos a configuração.'); await ad.getByRole('button', { name: 'Concluir atendimento' }).click(); await ad.waitForTimeout(6000)
const b1 = sql(`select status, fechada_em is null aberto from orders where id='${oB.id}'`)[0]
ok(b1.status === 'concluida' && b1.aberto, 'concluir sem assinatura do solicitante: a OS aguarda a confirmação do cliente')
await ad.reload(); await ad.waitForSelector('[data-testid=info-portal]', { timeout: 20000 }); await ad.waitForTimeout(1500)
ok((await ad.getByTestId('aguardando-confirmacao-os').innerText()).includes('fecha sozinho em'), 'a ficha mostra "Aguardando a confirmação do cliente — fecha sozinho em …"')
await ver(oB.id)
ok((await an.getByTestId('resumo-resolucao').innerText()).includes('Reiniciamos o modem') && await an.getByTestId('confirmar-solucao').count() === 1 && await an.getByTestId('nao-resolvido').count() === 1, 'portal: "Resolvido" com o resumo e os botões Confirmar solução / Não foi resolvido')
ok((await an.getByTestId('fecha-em').innerText()).includes('fechado automaticamente em'), 'avisa a data do fechamento automático')
ok(await an.getByTestId('baixar-relatorio').waitFor({ timeout: 60000 }).then(() => true).catch(() => false), 'o relatório (PDF) aparece para o cliente (gerado ao concluir)')
await an.reload(); await an.waitForSelector('[data-testid=baixar-relatorio]', { timeout: 30000 }).catch(() => {})
const [pop] = await Promise.all([an.context().waitForEvent('page', { timeout: 20000 }).catch(() => null), an.getByTestId('baixar-relatorio').click().catch(() => {})])
const urlPdf = pop ? pop.url() : ''
await new Promise(r => setTimeout(r, 2500)); const urlFinal = pop ? pop.url() : urlPdf
ok(/supabase\.co\/storage\/v1\/object\/sign\//.test(urlFinal), 'o PDF abre por um endereço assinado de curta duração (' + urlFinal.slice(0, 60) + '…)')
if (urlFinal) { const r = await fetch(urlFinal); ok(r.status === 200 && (r.headers.get('content-type') || '').includes('pdf'), 'e é mesmo um PDF (HTTP ' + r.status + ')') }
await an.getByTestId('confirmar-solucao').click(); await an.waitForTimeout(3500)
const b2 = sql(`select fechada_em is not null f, fechamento_tipo t from orders where id='${oB.id}'`)[0]
ok(b2.f && b2.t === 'confirmada', 'o cliente confirma: fechado ("confirmada")')
await an.reload(); await an.waitForSelector('[data-testid=resolucao]', { timeout: 20000 })
ok((await an.getByTestId('resolucao').innerText()).includes('você confirmou a solução') && (await an.locator('[data-status=fechado]').count()) >= 1, 'portal: "Fechado" com "você confirmou a solução"')

// ===== C: "não foi resolvido" reabre =====
await ad.goto(U + '/os/' + oC.id); await ad.waitForSelector('[data-testid=conversa-os]', { timeout: 20000 }); await ad.waitForTimeout(1500)
await ad.getByRole('button', { name: 'Concluir', exact: true }).click(); await ad.waitForSelector('#relato', { timeout: 15000 })
await ad.locator('#relato').fill('Trocamos o cabo de rede.'); await ad.getByRole('button', { name: 'Concluir atendimento' }).click(); await ad.waitForTimeout(6000)
await ver(oC.id)
await an.getByTestId('nao-resolvido').click(); await an.waitForSelector('[data-testid=form-nao-resolvido]')
ok(await an.getByTestId('enviar-nao-resolvido').isDisabled(), 'sem o motivo, o botão fica desligado')
await an.getByTestId('motivo-nao-resolvido').fill('A internet volta mas cai a cada 10 minutos'); await an.getByTestId('enviar-nao-resolvido').click(); await an.waitForTimeout(4000)
const c1 = sql(`select status, technician_id, reaberturas, fechada_em is null aberto, nao_resolvido_motivo from orders where id='${oC.id}'`)[0]
ok(c1.status === 'em_andamento' && c1.technician_id === tec && c1.reaberturas === 1 && c1.aberto, 'banco: reaberta para o mesmo técnico, 1 reabertura, ainda sem fechamento')
await an.reload(); await an.waitForSelector('[data-testid=conversa]', { timeout: 20000 }); await an.waitForTimeout(1000)
ok(await an.getByTestId('reaberto-aviso').count() === 1 && await an.getByTestId('resolucao').count() === 0, 'portal: volta a "Em atendimento" e mostra "reaberto a seu pedido: …"')
await ad.goto(U + '/os'); await ad.waitForTimeout(2500); await ad.getByTestId('sino').first().click(); await ad.waitForSelector('[data-testid=sino-painel]')
ok(/NÃO foi resolvido/.test(await ad.locator('[data-testid=sino-painel]').innerText()), 'sino: "o cliente diz que NÃO foi resolvido"')
await ad.goto(U + '/os/' + oC.id); await ad.waitForSelector('[data-testid=info-portal]', { timeout: 20000 }); await ad.waitForTimeout(1500)
ok((await ad.getByTestId('reaberturas-os').innerText()).includes('A internet volta mas cai'), 'a ficha mostra o motivo da reabertura')

// ===== configuração do fechamento automático =====
await ad.goto(U + '/configuracoes'); await ad.waitForSelector('[data-secao="portal-abertura"]', { timeout: 20000 })
if (!(await ad.getByTestId('portal-abertura-config').isVisible().catch(() => false))) await ad.locator('[data-secao="portal-abertura"]').click()
await ad.waitForSelector('[data-testid=config-fechamento]'); await ad.getByTestId('dias-fechamento').fill('5'); await ad.getByTestId('salvar-fechamento').click(); await ad.waitForTimeout(2000)
ok(sql(`select fechamento_dias_uteis d from tenants where id='${T}'`)[0].d === 5, 'Configurações: o admin define os dias úteis do fechamento automático')
const m = await nova({ ...devices['iPhone 13'] }); await m.goto(PH + '/entrar'); await m.fill('#portal-email', 'e5c.ana@example.com'); await m.fill('#portal-senha', SENHA); await m.click('[data-testid=portal-entrar] button[type=submit]'); await m.waitForTimeout(4500)
await m.goto(PH + '/chamados/' + oB.id); await m.waitForSelector('[data-testid=resolucao]', { timeout: 20000 })
ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: o cartão de resolução não rola para o lado')
console.log('erros:', erros.filter(e => !/favicon/.test(e)))
limpar(); resumo(); await b.close()
