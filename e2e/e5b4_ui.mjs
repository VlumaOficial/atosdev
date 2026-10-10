// E5b parte 4 — cliente ausente, motivos de cancelamento cadastráveis, nova visita e visita que gera chamado.
import { chromium, devices } from 'playwright'
import { N, U, T, SB, anon, cred, sql, ok, resumo, token, entrar } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const admTok = await token(cred.admin)
const SENHA = 'Senha-E5b4-1234'
const acesso = async (tok, body) => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json() }
const linkTeste = () => sql(`select detalhe->>'link_teste' l from portal_auditoria where detalhe->>'link_teste' is not null order by id desc limit 1`)[0]?.l
const limpar = () => sql(`delete from orders where title like 'E5B4 %' or title like 'Nova visita — E5B4 %' or title like 'Serviço da visita%' or title like 'E5B4%'; delete from os_categorias where nome like 'E5B4 %'; delete from motivos_cancelamento where nome like 'E5B4 %'; delete from auth.users where email like 'e5b4.%'; delete from portal_pessoas where email like 'e5b4.%'; delete from portal_convites where email like 'e5b4.%'; update tenants set agendamento_config='{}' where id='${T}'`)
limpar()
sql(`update tenants set portal_abertura='{}', agendamento_config='{}' where id='${T}'`)
sql(`update clients set portal_ativo = true where id='${CLI}'`)
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal) values ('${T}','E5B4 Vistoria', true, '{visita,incidente}')`)
const cat = sql(`select id from os_categorias where nome='E5B4 Vistoria'`)[0].id
await acesso(admTok, { acao: 'convidar', client_id: CLI, email: 'e5b4.ana@example.com', nome: 'E5B4 Ana', perfil: 'usuario' })
await acesso(null, { acao: 'aceitar', token: linkTeste().split('/convite/')[1], nome: 'E5B4 Ana', senha: SENHA })
const uid = sql(`select user_id from portal_pessoas where email='e5b4.ana@example.com'`)[0].user_id
sql(`insert into termos_aceites (user_id, tenant_id, termo_id, canal) select '${uid}','${T}', x.id, 'portal' from portal_termos_vigentes('${T}') x`)
const anaTok = await token(['e5b4.ana@example.com', SENHA])
const tec = sql(`select id from users where email='${cred.tecnico[0]}'`)[0].id
const ld = n => { const x = new Date(Date.now() + n * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const abrirVisita = async titulo => (await (await fetch(SB + '/rest/v1/rpc/portal_abrir_chamado', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + anaTok, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p: { client_id: CLI, tipo: 'visita', categoria_id: cat, titulo, descricao: 'Visita técnica para vistoria dos equipamentos', preferencias: [{ data: ld(6), periodo: 'manha' }], compartilhado: false } }) })).json())

const b = await chromium.launch(); const erros = []
const nova = async (opts = { viewport: { width: 1366, height: 950 } }) => { const p = await (await b.newContext(opts)).newPage(); p.on('pageerror', e => erros.push(e.message)); return p }
const ad = await nova(); await entrar(ad, cred.admin)
const an = await nova(); await an.goto(PH + '/entrar'); await an.fill('#portal-email', 'e5b4.ana@example.com'); await an.fill('#portal-senha', SENHA); await an.click('[data-testid=portal-entrar] button[type=submit]'); await an.waitForTimeout(4500)

// ===== motivos de cancelamento cadastráveis =====
await ad.goto(U + '/sla'); await ad.waitForTimeout(2500)
await ad.getByRole('tab', { name: /Motivos de cancelamento/ }).click().catch(async () => { await ad.locator('text=Motivos de cancelamento').first().click() })
await ad.waitForSelector('[data-testid=aba-cancelamentos]', { timeout: 15000 }); await ad.waitForTimeout(1000)
ok(await ad.locator('[data-motivo-cancelamento="Cliente ausente"]').innerText().then(t => t.includes('sistema')), 'Catálogo e SLA › Motivos de cancelamento: "Cliente ausente" aparece como motivo do sistema')
ok(await ad.locator('[data-motivo-cancelamento="Cliente ausente"] input[type=checkbox]').isDisabled() && await ad.locator('[data-motivo-cancelamento="Cliente ausente"] input[type=checkbox]').isChecked(), '"Cliente ausente" sempre conta como visita improdutiva (não dá para desmarcar)')
await ad.fill('[data-testid=novo-motivo-cancelamento] input[aria-label="Novo motivo de cancelamento"]', 'E5B4 Cliente mudou de endereço')
await ad.locator('[data-testid=novo-motivo-cancelamento] label', { hasText: 'Visita improdutiva' }).locator('input').check()
await ad.locator('[data-testid=novo-motivo-cancelamento] button', { hasText: 'Adicionar' }).click(); await ad.waitForTimeout(2000)
const nm = sql(`select improdutiva, codigo from motivos_cancelamento where nome='E5B4 Cliente mudou de endereço'`)[0]
ok(nm && nm.improdutiva && nm.codigo === null, 'o admin CADASTRA um motivo de cancelamento novo (improdutivo)')

// ===== cliente ausente no app =====
const v1 = await abrirVisita('E5B4 visita 1')
sql(`update orders set technician_id='${tec}', status='agendada', scheduled_at = now() + interval '3 hours', agendado_pelo_cliente = true where id='${v1.id}'`)
const tc = await nova({ ...devices['iPhone 13'], permissions: ['geolocation'], geolocation: { latitude: -12.9714, longitude: -38.5014 } }); await entrar(tc, cred.tecnico)
await tc.goto(U + '/campo/os/' + v1.id); await tc.waitForSelector('[data-testid=conversa-os]', { timeout: 20000 }); await tc.waitForTimeout(1500)
ok(await tc.getByRole('button', { name: 'Cliente ausente' }).count() === 1, 'app do técnico: botão "Cliente ausente"')
ok(await tc.getByTestId('gerar-chamado').count() === 1, 'app do técnico: "Gerar chamado" na visita')
await tc.getByRole('button', { name: 'Cliente ausente' }).click(); await tc.waitForSelector('#motivo-cancelamento')
ok(await tc.locator('#motivo-cancelamento option:checked').innerText().then(t => t.startsWith('Cliente ausente')), 'o motivo "Cliente ausente" já vem escolhido')
ok((await tc.getByTestId('aviso-ausente').innerText()).includes('Evidências'), 'avisa que hora e posição ficam registradas e sugere a foto nas Evidências')
await tc.fill('#reason', 'Portão fechado, ninguém atendeu'); await tc.getByRole('button', { name: 'Confirmar' }).click(); await tc.waitForTimeout(5000)
const o1 = sql(`select status, improdutiva, cliente_ausente_em is not null a, cancel_reason, (select codigo from motivos_cancelamento where id=cancel_motivo_id) cod from orders where id='${v1.id}'`)[0]
ok(o1.status === 'cancelada' && o1.improdutiva && o1.a && o1.cod === 'ausente' && o1.cancel_reason.startsWith('Cliente ausente — Portão fechado'), 'banco: cancelada, improdutiva, com a hora e o motivo "Cliente ausente"')
const ev = sql(`select details from order_events where order_id='${v1.id}' and event_type='cancelled' order by created_at desc limit 1`)[0].details
ok(ev.cliente_ausente === true && typeof ev.lat === 'number' && Math.abs(ev.lat + 12.9714) < 0.01, 'o evento guarda a posição do técnico como prova (lat/lng)')

// ===== o cliente vê e pede nova visita =====
await an.goto(PH + '/chamados/' + v1.id); await an.waitForSelector('[data-testid=visita-nao-realizada]', { timeout: 20000 }); await an.waitForTimeout(800)
ok((await an.getByTestId('visita-nao-realizada').innerText()).includes('Visita não realizada: cliente ausente'), 'portal: "Visita não realizada: cliente ausente"')
await an.getByTestId('pedir-nova-visita').click(); await an.waitForSelector('[data-testid=form-nova-visita]')
await an.locator('[data-data="0"]').fill(ld(8)); await an.getByTestId('nv-obs').fill('Agora a portaria vai estar aberta'); await an.getByTestId('enviar-nova-visita').click(); await an.waitForTimeout(4500)
const nv = sql(`select id, number, tipo, origem, relacionada_a from orders where relacionada_a='${v1.id}'`)[0]
ok(nv && nv.tipo === 'visita' && nv.origem === 'portal', 'a nova visita foi criada, ligada à anterior')
ok(an.url().includes('/chamados/' + nv.id) && await an.getByTestId('link-relacionada').count() === 1, 'o cliente cai na nova visita, com o vínculo "Relacionado ao chamado …"')
await an.goto(PH + '/chamados/' + v1.id); await an.waitForSelector('[data-testid=visita-nao-realizada]'); await an.waitForTimeout(800)
ok(await an.getByTestId('pedir-nova-visita').count() === 0 && (await an.getByTestId('visita-nao-realizada').innerText()).includes('nova visita em andamento'), 'enquanto há nova visita em andamento, não dá para pedir outra')
await ad.goto(U + '/os/' + v1.id); await ad.waitForSelector('[data-testid=info-portal]', { timeout: 20000 }); await ad.waitForTimeout(1500)
ok(await ad.getByTestId('visita-improdutiva-os').count() === 1 && await ad.getByTestId('derivados-os').count() === 1, 'a ficha da OS mostra "Visita improdutiva" e a nova visita gerada')
await new Promise(r => setTimeout(r, 6000))
ok(sql(`select count(*)::int n from portal_avisos where order_id='${v1.id}' and evento='cancelado' and detalhe like '%não foi realizada%'`)[0].n === 1, 'e-mail: "A visita … não foi realizada" (convida a pedir nova visita)')

// ===== visita gera chamado =====
const v2 = await abrirVisita('E5B4 visita 2')
sql(`update orders set technician_id='${tec}', status='em_andamento', started_at=now() where id='${v2.id}'`)
await ad.goto(U + '/os/' + v2.id); await ad.waitForSelector('[data-testid=gerar-chamado]', { timeout: 20000 }); await ad.waitForTimeout(1000)
await ad.getByTestId('gerar-chamado').click(); await ad.waitForSelector('[data-testid=form-gerar-chamado]')
ok((await ad.inputValue('#gc-titulo')).startsWith('Serviço da visita'), 'o título já vem sugerido')
await ad.fill('#gc-titulo', 'E5B4 Câmera da entrada com defeito'); await ad.getByTestId('confirmar-gerar-chamado').click(); await ad.waitForTimeout(800)
ok((await ad.getByTestId('erro-gerar-chamado').innerText()).includes('Descreva'), 'sem a descrição → aviso claro')
await ad.fill('#gc-desc', 'Na vistoria encontramos a câmera da entrada sem imagem'); await ad.selectOption('#gc-cat', { label: 'E5B4 Vistoria' }); await ad.getByTestId('confirmar-gerar-chamado').click(); await ad.waitForTimeout(4500)
const g = sql(`select id, tipo, origem, relacionada_a, solicitante_id is not null s, classificada_em is null t from orders where title='E5B4 Câmera da entrada com defeito'`)[0]
ok(g && g.tipo === 'incidente' && g.relacionada_a === v2.id && g.s && g.t, 'banco: Incidente ligado à visita, com o solicitante do portal e ainda sem triagem')
ok(ad.url().includes('/os/' + g.id), 'a equipe cai no chamado gerado')
await ad.waitForSelector('[data-testid=relacionada-os]', { timeout: 15000 })
ok((await ad.getByTestId('relacionada-os').innerText()).includes(v2.numero), 'o chamado gerado mostra "Relacionada a" a visita')
ok((await ad.getByTestId('triagem-estado').innerText()).includes('aguardando a triagem'), 'e entra na triagem do N1')
await an.goto(PH + '/chamados/' + v2.id); await an.waitForSelector('[data-testid=chamados-ligados]', { timeout: 20000 })
ok((await an.getByTestId('chamados-ligados').innerText()).includes('gerados a partir deste'), 'o cliente vê, na visita, o chamado gerado a partir dela')

// ===== cancelar com motivo da lista =====
await ad.getByRole('button', { name: 'Cancelar' }).click(); await ad.waitForSelector('#motivo-cancelamento')
await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(800)
ok((await ad.locator('[role=dialog]').innerText()).includes('motivo do cancelamento'), 'cancelar sem escolher o motivo → aviso claro')
const dup = sql(`select id from motivos_cancelamento where tenant_id='${T}' and nome='Duplicado'`)[0].id
await ad.selectOption('#motivo-cancelamento', dup); await ad.getByRole('button', { name: 'Confirmar' }).click(); await ad.waitForTimeout(3500)
const c3 = sql(`select status, improdutiva, cancel_reason from orders where id='${g.id}'`)[0]
ok(c3.status === 'cancelada' && !c3.improdutiva && c3.cancel_reason === 'Duplicado', 'cancelar com "Duplicado": cancelada, não improdutiva')
const m = await nova({ ...devices['iPhone 13'] }); await m.goto(PH + '/entrar'); await m.fill('#portal-email', 'e5b4.ana@example.com'); await m.fill('#portal-senha', SENHA); await m.click('[data-testid=portal-entrar] button[type=submit]'); await m.waitForTimeout(4500)
await m.goto(PH + '/chamados/' + v1.id); await m.waitForSelector('[data-testid=visita-nao-realizada]', { timeout: 20000 })
ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: o aviso de visita não realizada não rola para o lado')
console.log('erros:', erros.filter(e => !/favicon/.test(e)))
limpar(); resumo(); await b.close()
