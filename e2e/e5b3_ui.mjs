// E5b parte 3 — agendamento combinado: configuração, calendário do cliente, proposta de data, reagendar/cancelar pelo cliente.
import { chromium, devices } from 'playwright'
import { N, U, T, SB, anon, cred, sql, ok, resumo, token, entrar } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const admTok = await token(cred.admin)
const SENHA = 'Senha-E5b3-1234'
const acesso = async (tok, body) => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json() }
const linkTeste = () => sql(`select detalhe->>'link_teste' l from portal_auditoria where detalhe->>'link_teste' is not null order by id desc limit 1`)[0]?.l
const limpar = () => sql(`delete from orders where title like 'E5B3 %'; delete from os_categorias where nome like 'E5B3 %'; delete from auth.users where email like 'e5b3.%'; delete from portal_pessoas where email like 'e5b3.%'; delete from portal_convites where email like 'e5b3.%'; update tenants set agendamento_config='{}' where id='${T}'`)
limpar()
sql(`update tenants set portal_abertura='{}', agendamento_config='{}' where id='${T}'`)
sql(`update clients set portal_ativo = true where id='${CLI}'`)
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal) values ('${T}','E5B3 Vistoria', true, '{visita}')`)
const cat = sql(`select id from os_categorias where nome='E5B3 Vistoria'`)[0].id
await acesso(admTok, { acao: 'convidar', client_id: CLI, email: 'e5b3.ana@example.com', nome: 'E5B3 Ana', perfil: 'usuario' })
await acesso(null, { acao: 'aceitar', token: linkTeste().split('/convite/')[1], nome: 'E5B3 Ana', senha: SENHA })
const uid = sql(`select user_id from portal_pessoas where email='e5b3.ana@example.com'`)[0].user_id
sql(`insert into termos_aceites (user_id, tenant_id, termo_id, canal) select '${uid}','${T}', x.id, 'portal' from portal_termos_vigentes('${T}') x`)
const anaTok = await token(['e5b3.ana@example.com', SENHA])
const ld = n => { const x = new Date(Date.now() + n * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const abrirVisita = async (titulo, prefs) => (await (await fetch(SB + '/rest/v1/rpc/portal_abrir_chamado', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + anaTok, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p: { client_id: CLI, tipo: 'visita', categoria_id: cat, titulo, descricao: 'Visita técnica para vistoria dos equipamentos', preferencias: prefs, compartilhado: false } }) })).json())

const b = await chromium.launch(); const erros = []
const nova = async (opts = { viewport: { width: 1366, height: 950 } }) => { const p = await (await b.newContext(opts)).newPage(); p.on('pageerror', e => erros.push(e.message)); return p }
const ad = await nova(); await entrar(ad, cred.admin)
const an = await nova(); await an.goto(PH + '/entrar'); await an.fill('#portal-email', 'e5b3.ana@example.com'); await an.fill('#portal-senha', SENHA); await an.click('[data-testid=portal-entrar] button[type=submit]'); await an.waitForTimeout(4500)

// ===== configuração =====
await ad.goto(U + '/configuracoes'); await ad.waitForSelector('[data-secao="agendamento"]', { timeout: 20000 })
if (!(await ad.getByTestId('agendamento-config').isVisible().catch(() => false))) await ad.locator('[data-secao="agendamento"]').click()
await ad.waitForSelector('[data-testid=agendamento-config]'); await ad.waitForTimeout(800)
ok((await ad.getByTestId('ag-antecedencia').inputValue()) === '48' && (await ad.locator('[data-janela=manha] input').first().inputValue()) === 'Manhã' && await ad.locator('[data-testid=ag-lembretes] input[type=number]').count() === 2, 'Configurações › Agendamento: abre com os padrões (48 h, janelas, 2 lembretes)')
await ad.getByTestId('ag-antecedencia').fill('72'); await ad.getByTestId('ag-horizonte').fill('30')
await ad.locator('[data-janela=manha] input').first().fill('Manhã cedo'); await ad.locator('[data-janela=manha] input[type=time]').nth(0).fill('07:00'); await ad.locator('[data-janela=manha] input[type=time]').nth(1).fill('11:00')
await ad.getByTestId('ag-mais-lembrete').click(); await ad.locator('[data-testid=ag-lembretes] input[type=number]').nth(2).fill('2')
await ad.locator('[data-janela=tarde] input[type=time]').nth(0).fill('19:00'); await ad.getByTestId('ag-salvar').click(); await ad.waitForTimeout(1500)
ok((await ad.locator('[data-testid=agendamento-config] [role=status]').innerText()).includes('janela'), 'janela com início depois do fim → mensagem clara, nada salvo')
await ad.locator('[data-janela=tarde] input[type=time]').nth(0).fill('14:00'); await ad.getByTestId('ag-salvar').click(); await ad.waitForTimeout(2000)
const cfg = sql(`select agendamento_config c from tenants where id='${T}'`)[0].c
ok(cfg.antecedencia_horas === 72 && cfg.horizonte_dias === 30 && cfg.janelas.manha.nome === 'Manhã cedo' && cfg.lembretes.length === 3, 'o admin salva as regras (antecedência, horizonte, janelas e 3 lembretes)')

// ===== calendário do cliente =====
await an.goto(PH + '/abrir'); await an.waitForSelector('[data-tipo=visita]', { timeout: 20000 }); await an.locator('[data-tipo=visita]').click()
await an.selectOption('#ab-assunto', { label: 'E5B3 Vistoria' }); await an.waitForSelector('[data-testid=opcoes-datas]')
ok((await an.getByTestId('regra-datas').innerText()).includes('72 horas'), 'o cliente vê a regra: "antecedência mínima de 72 horas"')
ok((await an.locator('[data-periodo="0"]').innerText()).includes('Manhã cedo (07:00–11:00)'), 'as janelas aparecem com o nome e o horário da empresa')
const minAttr = await an.locator('[data-data="0"]').getAttribute('min')
ok(minAttr >= ld(2), 'o calendário não deixa escolher antes da antecedência (min = ' + minAttr + ')')
await an.locator('[data-data="0"]').fill(ld(1)); await an.waitForTimeout(2500)
ok((await an.locator('[data-aviso-data="0"]').innerText()).includes('a partir de'), 'data antes da antecedência → aviso "Escolha uma data a partir de…"')

// ===== proposta de data =====
const v1 = await abrirVisita('E5B3 visita 1', [{ data: ld(6), periodo: 'manha' }, { data: ld(8), periodo: 'tarde' }])
ok(!!v1.id, 'visita aberta com 2 datas dentro da regra: ' + v1.numero)
await ad.goto(U + '/os/' + v1.id); await ad.waitForSelector('[data-testid=info-portal]', { timeout: 20000 }); await ad.waitForTimeout(1500)
await ad.getByRole('button', { name: 'Agendar' }).click(); await ad.waitForSelector('#schedule-date')
await ad.fill('#schedule-date', ld(10) + 'T10:00'); await ad.fill('#reason', 'Equipe disponível nessa data'); await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3500)
ok(sql(`select agendamento_status s from orders where id='${v1.id}'`)[0].s === 'proposto', 'data que o cliente NÃO pediu → "proposto"')
await ad.reload(); await ad.waitForSelector('[data-testid=info-portal]'); await ad.waitForTimeout(1500)
ok(await ad.getByTestId('agendamento-proposto-os').count() === 1, 'a ficha da OS mostra "Proposta de data enviada ao cliente"')
await an.goto(PH + '/chamados/' + v1.id); await an.waitForSelector('[data-testid=proposta-data]', { timeout: 20000 }); await an.waitForTimeout(800)
ok(await an.getByTestId('aceitar-data').count() === 1 && await an.getByTestId('pedir-outra-data').count() === 1, 'o cliente vê "Proposta de data" com Aceitar e Pedir outra data')
await an.getByTestId('pedir-outra-data').click(); await an.waitForSelector('[data-testid=form-outra-data]')
await an.locator('[data-data="0"]').fill(ld(7)); await an.selectOption('[data-periodo="0"]', 'tarde'); await an.getByTestId('outra-motivo').fill('O dia 10 não dá para nós')
await an.getByTestId('enviar-outra-data').click(); await an.waitForTimeout(3500)
ok(sql(`select agendamento_status s, reagendamentos_cliente r from orders where id='${v1.id}'`)[0].s === 'reagendamento_pedido', 'o pedido de outra data é gravado')
ok(sql(`select reagendamentos_cliente r from orders where id='${v1.id}'`)[0].r === 0, 'recusar uma proposta não gasta o limite de reagendamentos')
await an.reload(); await an.waitForSelector('[data-testid=pedido-enviado]', { timeout: 20000 })
ok((await an.getByTestId('pedido-enviado').innerText()).includes('Você pediu outra data'), 'o cliente vê "Você pediu outra data — aguardando a empresa"')

// ===== a equipe responde =====
await ad.goto(U + '/os'); await ad.waitForTimeout(2500)
await ad.getByTestId('sino').first().click(); await ad.waitForSelector('[data-testid=sino-painel]')
ok(/pediu outra data/.test(await ad.locator('[data-testid=sino-painel]').innerText()), 'sino: "o cliente pediu outra data"')
await ad.locator('[data-aviso*="pediu outra data"]').first().click(); await ad.waitForSelector('[data-testid=info-portal]', { timeout: 20000 }); await ad.waitForTimeout(1500)
ok((await ad.getByTestId('agendamento-pedido-os').innerText()).includes('O dia 10 não dá para nós'), 'a ficha mostra o pedido e o motivo do cliente')
await ad.getByTestId('agendar-data-pedida').first().click(); await ad.waitForSelector('#schedule-date')
ok((await ad.inputValue('#schedule-date')).endsWith('T14:00'), '"Agendar nesta data" usa o início da janela da empresa (Tarde 14:00)')
await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3500)
ok(sql(`select agendamento_status s from orders where id='${v1.id}'`)[0].s === 'confirmado', 'agendar numa data pedida → "confirmado"')
await an.goto(PH + '/chamados/' + v1.id); await an.waitForSelector('[data-testid=agendamento]', { timeout: 20000 }); await an.waitForTimeout(1000)
await an.getByTestId('aceitar-data').click(); await an.waitForTimeout(3000)
ok(sql(`select agendamento_cliente_em is not null c from orders where id='${v1.id}'`)[0].c, 'o cliente confirma presença')
await an.reload(); await an.waitForSelector('[data-testid=data-confirmada]', { timeout: 20000 })
ok((await an.getByTestId('data-confirmada').innerText()).includes('Você confirmou presença'), 'o chamado mostra "Você confirmou presença em …"')

// ===== o cliente reagenda e cancela =====
await an.getByTestId('pedir-outra-data').click(); await an.waitForSelector('[data-testid=form-outra-data]')
await an.locator('[data-data="0"]').fill(ld(12)); await an.getByTestId('enviar-outra-data').click(); await an.waitForTimeout(3500)
ok(sql(`select agendamento_status s, reagendamentos_cliente r from orders where id='${v1.id}'`)[0].r === 1, 'reagendar um confirmado conta 1 no limite do cliente')
const v2 = await abrirVisita('E5B3 visita 2', [{ data: ld(6), periodo: 'manha' }])
sql(`update orders set status='agendada', scheduled_at = (now() + interval '4 days'), agendado_pelo_cliente = true where id='${v2.id}'`)
await an.goto(PH + '/chamados/' + v2.id + '?acao=cancelar')
ok(await an.waitForSelector('[data-testid=form-cancelar]', { timeout: 20000 }).then(() => true).catch(() => false), 'o link do lembrete (?acao=cancelar) abre o cancelamento')
await an.getByTestId('cancelar-motivo').fill('Vamos remarcar com a diretoria'); await an.getByTestId('confirmar-cancelar').click(); await an.waitForTimeout(3500)
const c2 = sql(`select status, cancel_reason from orders where id='${v2.id}'`)[0]
ok(c2.status === 'cancelada' && c2.cancel_reason === 'Cancelado pelo cliente — Vamos remarcar com a diretoria', 'cancelar: OS cancelada com "Cancelado pelo cliente — motivo"')
await ad.goto(U + '/os'); await ad.waitForTimeout(2500); await ad.getByTestId('sino').first().click(); await ad.waitForSelector('[data-testid=sino-painel]')
ok(/cancelado pelo cliente/.test(await ad.locator('[data-testid=sino-painel]').innerText()), 'sino: "cancelado pelo cliente"')
const v3 = await abrirVisita('E5B3 visita 3', [{ data: ld(6), periodo: 'manha' }])
sql(`update orders set status='agendada', scheduled_at = (now() + interval '4 days'), agendado_pelo_cliente = true where id='${v3.id}'`)
await an.goto(PH + '/chamados/' + v3.id + '?acao=confirmar'); await an.waitForTimeout(5000)
ok(sql(`select agendamento_cliente_em is not null c from orders where id='${v3.id}'`)[0].c, 'o link do lembrete (?acao=confirmar) confirma a presença sozinho')
const m = await nova({ ...devices['iPhone 13'] }); await m.goto(PH + '/entrar'); await m.fill('#portal-email', 'e5b3.ana@example.com'); await m.fill('#portal-senha', SENHA); await m.click('[data-testid=portal-entrar] button[type=submit]'); await m.waitForTimeout(4500)
await m.goto(PH + '/chamados/' + v3.id); await m.waitForSelector('[data-testid=agendamento]', { timeout: 20000 }); await m.waitForTimeout(1000)
ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: o chamado com os botões do agendamento não rola para o lado')
console.log('erros:', erros.filter(e => !/favicon/.test(e)))
limpar(); resumo(); await b.close()
