// Ajustes do 1º teste manual: celular do pedido acompanha o convite, "mostrar senha" na confirmação,
// rodapé do portal colado no fim da tela. Roda contra a URL pública.
import { chromium } from 'playwright'
import { T, SB, anon, cred, sql, ok, resumo, token } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const admTok = await token(cred.admin)
const chamar = async (tok, body) => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() } }
const limpar = () => sql(`delete from auth.users where email like 'e5aj.%'; delete from portal_pessoas where email like 'e5aj.%'; delete from portal_convites where email like 'e5aj.%'; delete from portal_solicitacoes_acesso where email like 'e5aj.%'`)
limpar()
sql(`update clients set portal_ativo = true where name = 'Cliente Trigger Teste'`)
const EMAIL = 'e5aj.pessoa@example.com', SENHA = 'Senha-E5aj-123'

// ---- o pedido leva o celular até o convite
sql(`insert into portal_solicitacoes_acesso (tenant_id, nome, email, celular, cliente_texto, ip_hash) values ('${T}','E5AJ Pessoa','${EMAIL}','71988887777','Cliente Trigger Teste','x')`)
const id = sql(`select id from portal_solicitacoes_acesso where email='${EMAIL}'`)[0].id
const r = await chamar(admTok, { acao: 'decidir_solicitacao', id, aprovar: true, client_id: CLI })
ok(r.s === 200 && r.j.ok, 'aprovar o pedido envia o convite')
ok(sql(`select celular from portal_convites where email='${EMAIL}' and aceito_em is null`)[0]?.celular === '71988887777', 'o convite guarda o celular informado no pedido')
const link = sql(`select detalhe->>'link_teste' l from portal_auditoria where detalhe->>'link_teste' is not null order by id desc limit 1`)[0].l
const tok = link.split('/convite/')[1]
ok((await chamar(null, { acao: 'consultar', token: tok })).j.celular === '71988887777', 'consultar devolve o celular para preencher a tela')

const b = await chromium.launch(); const erros = []
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage()
p.on('pageerror', e => erros.push(e.message))
await p.goto(PH + '/convite/' + tok); await p.waitForSelector('#cv-cel', { timeout: 20000 })
ok((await p.inputValue('#cv-cel')) === '71988887777', 'a tela de criar senha já vem com o celular do pedido')
// mostrar/ocultar senha nos DOIS campos
await p.fill('#cv-senha', SENHA); await p.fill('#cv-conf', SENHA)
ok((await p.getAttribute('#cv-conf', 'type')) === 'password', 'confirmação começa oculta')
await p.getByTestId('ver-cv-conf').click()
ok((await p.getAttribute('#cv-conf', 'type')) === 'text' && (await p.inputValue('#cv-conf')) === SENHA, 'botão do olho na confirmação mostra a senha digitada')
ok((await p.getAttribute('#cv-senha', 'type')) === 'password', 'o olho de um campo não mexe no outro')
await p.getByTestId('ver-cv-senha').click(); ok((await p.getAttribute('#cv-senha', 'type')) === 'text', 'o campo de senha também mostra')
await p.screenshot({ path: process.env.ATOS_SCRATCH ? process.env.ATOS_SCRATCH + '/ajustes_convite.png' : '/tmp/ajustes_convite.png' })
await p.getByTestId('convite-criar').click(); await p.waitForTimeout(6000)
ok(sql(`select celular from portal_pessoas where email='${EMAIL}'`)[0]?.celular === '71988887777', 'a pessoa nasce com o celular do pedido')
const uid = sql(`select user_id from portal_pessoas where email='${EMAIL}'`)[0].user_id
sql(`insert into termos_aceites (user_id, tenant_id, termo_id, canal) select '${uid}','${T}', x.id, 'portal' from portal_termos_vigentes('${T}') x`)

// ---- preferências já mostram o celular; rodapé colado no fim
await p.goto(PH + '/preferencias'); await p.waitForSelector('#pref-cel', { timeout: 20000 }); await p.waitForTimeout(1200)
ok((await p.inputValue('#pref-cel')).replace(/\D/g, '') === '71988887777', 'Preferências mostra o celular')
for (const rota of ['/abrir', '/preferencias', '/chamados']) {
  await p.goto(PH + rota); await p.waitForSelector('footer', { timeout: 20000 }); await p.waitForTimeout(1200)
  const f = await p.locator('footer').boundingBox()
  ok(f && f.y + f.height >= 900 - 30, `rodapé colado no fim da tela em ${rota} (base em ${Math.round(f.y + f.height)} de 900)`)
}
// celular: telas altas não ficam com rodapé no meio
const m = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await m.goto(PH + '/entrar'); await m.fill('#portal-email', EMAIL); await m.fill('#portal-senha', SENHA); await m.click('[data-testid=portal-entrar] button[type=submit]'); await m.waitForTimeout(4500)
await m.goto(PH + '/abrir'); await m.waitForSelector('footer', { timeout: 20000 }); await m.waitForTimeout(1200)
const fm = await m.locator('footer').boundingBox()
ok(fm && fm.y + fm.height >= 844 - 30, 'rodapé no fim também no celular')
ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal no celular')
console.log('erros:', erros.filter(e => !/favicon/.test(e)))
limpar(); resumo(); await b.close()
