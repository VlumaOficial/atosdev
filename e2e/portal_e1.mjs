import { chromium, devices } from 'playwright'
import fs from 'fs'
import { execSync } from 'child_process'
const S = (process.env.ATOS_SCRATCH || '/tmp/atos-scratch')
const U = 'https://atosdev.vluma.com.br'
const P = 'https://atendimento.infoxtec.dev.vluma.com.br'   // endereço oficial do portal
const sql = q => JSON.parse(execSync(`${S}/sql.sh -c ${JSON.stringify(q)}`).toString())
const cred = JSON.parse(fs.readFileSync(S + '/.cred.json'))
const T = '30752cf0-fbfa-419b-afe4-75e06d6992f5'
let falhas = 0
const ok = (c, msg) => { if (!c) falhas++; console.log((c ? 'OK  ' : 'FALHA ') + msg) }
const browser = await chromium.launch()
const erros = []
async function nova(opts = { viewport: { width: 1366, height: 900 } }) {
  const ctx = await browser.newContext(opts); const p = await ctx.newPage()
  p.on('console', m => { if (m.type() === 'error') erros.push(m.text()) })
  p.on('pageerror', e => erros.push('pageerror ' + e.message))
  p.on('response', r => { if (r.status() >= 400) erros.push(r.status() + ' ' + r.request().method() + ' ' + r.url().slice(0, 140)) })
  return p
}
async function loginPainel(p, c) {
  await p.goto(U + '/login'); await p.fill('#email', c[0]); await p.fill('#password', c[1]); await p.click('button[type=submit]')
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
}

// estado inicial limpo do portal da Infoxtec (DEV)
sql(`update tenants set portal_habilitado=false, portal_ativo=false, portal_slug=null, portal_nome=null, portal_cor=null, portal_boas_vindas=null, portal_contatos='{}', portal_termos_proprios='{}', portal_logo_versao=null where id='${T}'`)
sql(`delete from portal_slugs_antigos where tenant_id='${T}'; delete from termos_aceites where tenant_id='${T}'; delete from termos where tenant_id='${T}'; delete from portal_auditoria where tenant_id='${T}'`)

// 1. Super Admin habilita
const sa = await nova()
await loginPainel(sa, cred.super)
await sa.goto(U + '/tenants'); await sa.waitForTimeout(2500)
await sa.selectOption('select[aria-label^="Portal de atendimento Infoxtec"]', 'sim'); await sa.waitForTimeout(2000)
ok(sql(`select portal_habilitado from tenants where id='${T}'`)[0].portal_habilitado === true, 'Super Admin habilitou o portal da Infoxtec')
await sa.goto(U + '/configuracoes'); await sa.waitForTimeout(2000)
ok(await sa.locator('[data-secao="plataforma-portal"]').count() === 1, 'Super Admin vê "Plataforma — portal de atendimento"')
await sa.locator('[data-secao="plataforma-portal"]').click(); await sa.waitForTimeout(1200)
ok((await sa.locator('text=Termos padrão VLUMA').count()) > 0 && (await sa.locator('text=versão 1').count()) >= 3, 'termos padrão v1 listados para o Super Admin')

// 2. Admin configura
const ad = await nova()
await loginPainel(ad, cred.admin)
await ad.goto(U + '/configuracoes'); await ad.waitForTimeout(2500)
const sec = ad.locator('[data-secao="portal"]')
if (!(await ad.locator('[data-testid=portal-config]').isVisible().catch(() => false))) await sec.click()
await ad.waitForTimeout(1000)
ok(await ad.locator('[data-testid=portal-config]').isVisible(), 'admin vê a configuração do portal')
await ad.fill('#portal-slug', 'admin'); await ad.waitForTimeout(1500)
ok(await ad.locator('text=Este nome é reservado').count() > 0, 'nome reservado recusado ("admin")')
await ad.fill('#portal-slug', 'infoxtec'); await ad.waitForTimeout(1500)
ok(await ad.locator('text=Disponível').count() > 0, '"infoxtec" disponível')
await ad.fill('#portal-cor', '#0b4f9c')
await ad.fill('#portal-boas', 'Bem-vindo à central da Infoxtec. Abra e acompanhe seus chamados por aqui.')
await ad.fill('[aria-label="E-mail de atendimento"]', 'suporte@infoxtec.com.br')
await ad.fill('[aria-label="WhatsApp"]', '(71) 99999-0000')
await ad.getByRole('button', { name: 'Salvar' }).last().click(); await ad.waitForTimeout(3000)
let t = sql(`select portal_slug, portal_ativo, portal_cor, portal_contatos, portal_logo_versao from tenants where id='${T}'`)[0]
ok(t.portal_slug === 'infoxtec' && t.portal_ativo === false && t.portal_cor === '#0b4f9c' && t.portal_contatos.whatsapp === '71999990000', 'configuração salva (inativo), WhatsApp só com dígitos')
ok(!!t.portal_logo_versao, 'logo publicada no portal ao salvar pela 1ª vez')

// prévia do admin (portal inativo)
await ad.goto(U + '/portal/infoxtec'); await ad.waitForTimeout(3000)
ok(await ad.locator('[data-testid=portal-previa]').count() > 0, 'aviso de prévia para o admin (portal inativo)')
ok(await ad.locator('[data-testid=portal-previa-interna]').count() > 0, 'admin logado vê a prévia interna')
ok(await ad.locator('img[src*="portal-publico"]').count() > 0, 'logo da empresa no portal')
const corBotao = await ad.locator('button:has-text("Botão na cor da empresa")').evaluate(e => getComputedStyle(e).backgroundColor)
ok(corBotao !== 'rgb(124, 58, 237)', 'botão na cor da empresa (' + corBotao + ')')

// anônimo com portal inativo não vê
const an = await nova()
await an.goto(P + '/'); await an.waitForTimeout(4000)
ok(await an.locator('[data-testid=portal-indisponivel]').count() > 0, 'portal inativo: visitante vê "Portal não encontrado"')

// texto próprio dos termos de uso + ativar
await ad.goto(U + '/configuracoes'); await ad.waitForTimeout(2500)
if (!(await ad.locator('[data-testid=portal-config]').isVisible().catch(() => false))) await ad.locator('[data-secao="portal"]').click()
await ad.locator('[data-termo="uso"] button:has-text("Escrever texto próprio")').click(); await ad.waitForTimeout(800)
await ad.fill('#termo-titulo', 'Termos de uso — Infoxtec')
await ad.fill('#termo-texto', 'Este é o texto próprio de termos de uso da {{empresa}} para o portal de atendimento.\n\nUse com responsabilidade.')
await ad.getByRole('button', { name: 'Publicar nova versão' }).click(); await ad.waitForTimeout(2000)
await ad.locator('[data-termo="uso"] input[type=radio]').nth(1).check()
await ad.locator('[data-testid=portal-ativo]').check()
await ad.getByRole('button', { name: 'Salvar' }).last().click(); await ad.waitForTimeout(3000)
t = sql(`select portal_ativo, portal_termos_proprios from tenants where id='${T}'`)[0]
ok(t.portal_ativo === true && t.portal_termos_proprios.includes('uso'), 'portal ativado com termo de uso próprio')

// 3. visitante: entrar, termos públicos, 404
await an.goto(P + '/'); await an.waitForURL(/\/entrar/, { timeout: 15000 }); await an.waitForTimeout(1500)
ok(await an.locator('[data-testid=portal-entrar]').count() > 0 && await an.locator('text=Bem-vindo à central da Infoxtec').count() > 0, 'sem sessão → tela de entrar com boas-vindas')
ok(await an.locator('text=Central de Atendimento Infoxtec').count() > 0, 'nome padrão do portal')
await an.goto(P + '/termos/privacidade'); await an.waitForTimeout(2500)
const txtPriv = await an.locator('[data-testid=portal-termo]').innerText().catch(() => '')
ok(txtPriv.includes('Aviso de privacidade') && !txtPriv.includes('{{empresa}}') && /Infoxtec/.test(txtPriv), 'aviso de privacidade público, com o nome da empresa')
await an.goto(U + '/portal/nao-existe-xyz'); await an.waitForTimeout(2500)
ok(await an.locator('[data-testid=portal-indisponivel]').count() > 0, 'nome inexistente → "Portal não encontrado"')

// 4. pessoa do portal (celular)
const po = await nova({ ...devices['iPhone 13'] })
await po.goto(P + '/entrar'); await po.waitForTimeout(2000)
await po.fill('#portal-email', cred.portal[0]); await po.fill('#portal-senha', 'senha-errada-123'); await po.click('[data-testid=portal-entrar] button[type=submit]'); await po.waitForTimeout(2500)
ok(await po.locator('text=E-mail ou senha incorretos').count() > 0, 'senha errada → mensagem clara')
await po.fill('#portal-senha', cred.portal[1]); await po.click('[data-testid=portal-entrar] button[type=submit]'); await po.waitForTimeout(4000)
ok(await po.locator('[data-testid=portal-aceite]').count() > 0, 'primeiro acesso → tela de aceite dos termos')
ok(await po.locator('text=Termos de uso — Infoxtec').count() > 0, 'termo de uso PRÓPRIO da empresa no aceite')
ok(await po.locator('[data-testid=aceite-confirmar]').isDisabled(), '"Continuar" bloqueado sem aceitar os obrigatórios')
await po.locator('button:has-text("Aviso de privacidade")').click(); await po.waitForTimeout(500)
ok(await po.locator('[data-testid=termo-texto-privacidade]').isVisible(), 'texto do termo abre para leitura')
await po.locator('[data-testid=aceite-obrigatorio]').check()
await po.locator('[data-testid=aceite-confirmar]').click(); await po.waitForTimeout(4000)
ok(await po.locator('[data-testid=portal-inicio]').count() > 0, 'aceitou os obrigatórios e recusou comunicação → início')
ok(await po.locator('text=Olá, Maria!').count() > 0, 'saudação com o nome')
ok((await po.locator('[data-testid=portal-vinculos]').innerText()).includes('Cliente Trigger Teste') && (await po.locator('[data-testid=portal-vinculos]').innerText()).includes('Supervisor'), 'vínculo e perfil exibidos')
const wa = await po.locator('[data-testid=portal-contatos] a[href*="wa.me"]').getAttribute('href')
ok(wa && wa.startsWith('https://wa.me/5571999990000'), 'botão WhatsApp com o número da empresa')
const largura = await po.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
ok(largura, 'sem rolagem horizontal no celular')
const ac = sql(`select t.tipo, (a.revogado_em is not null) recusado, a.ip is not null tem_ip, a.user_agent is not null tem_ua from termos_aceites a join termos t on t.id=a.termo_id where a.user_id=(select user_id from portal_pessoas where email='portal.teste@example.com') and a.tenant_id='${T}' order by t.tipo`)
ok(ac.length === 3 && ac.find(x => x.tipo === 'comunicacao').recusado && !ac.find(x => x.tipo === 'uso').recusado && ac.every(x => x.tem_ua), 'aceites gravados (comunicação como recusa), com navegador')
await po.waitForTimeout(1500)
ok(sql(`select count(*)::int n from portal_auditoria where tenant_id='${T}' and acao='acesso'`)[0].n >= 1, 'acesso registrado na auditoria')
await po.locator('[data-testid=portal-sair]').click(); await po.waitForTimeout(2500)
await po.goto(P + '/entrar'); await po.fill('#portal-email', cred.portal[0]); await po.fill('#portal-senha', cred.portal[1]); await po.click('[data-testid=portal-entrar] button[type=submit]'); await po.waitForTimeout(4000)
ok(await po.locator('[data-testid=portal-inicio]').count() > 0, '2º login: não pede os termos de novo (inclusive o recusado)')
await po.screenshot({ path: S + '/portal_inicio_celular.png', fullPage: true })

// 5. pessoa do portal tentando o painel interno
await po.goto(U + '/os'); await po.waitForTimeout(3000)
ok(po.url().includes('/login'), 'pessoa do portal no painel interno → vai para o login (sem perfil interno)')

console.log('erros de console:', erros.filter(e => !/favicon/.test(e)))
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
await browser.close()
