import { chromium } from 'playwright'
import fs from 'fs'
import { execSync } from 'child_process'
const N = (process.env.ATOS_SCRATCH || '/tmp/atos-scratch')
const cred = JSON.parse(fs.readFileSync(N + '/.cred.json'))
const sql = q => JSON.parse(execSync(`${N}/sql.sh -c ${JSON.stringify(q)}`).toString())
const ATOS = 'https://atosdev.vluma.com.br', OLD = 'https://atendimento.infoxtec.dev.vluma.com.br', NEW = 'https://atendimento.infoxtec-t2.dev.vluma.com.br'
let f = 0; const ok = (c, m) => { if (!c) f++; console.log((c ? 'OK  ' : 'FALHA ') + m) }
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage()
await p.goto(ATOS + '/login'); await p.fill('#email', cred.admin[0]); await p.fill('#password', cred.admin[1]); await p.click('button[type=submit]'); await p.waitForTimeout(5000)
async function abrirConfig() {
  await p.goto(ATOS + '/configuracoes'); await p.waitForTimeout(3500)
  if (!(await p.locator('[data-testid=portal-config]').isVisible().catch(() => false))) await p.locator('[data-secao="portal"]').click()
  await p.waitForTimeout(2500)
}
await abrirConfig()
ok(await p.locator('[data-endereco="atendimento.infoxtec.dev.vluma.com.br"][data-situacao="ativo"]').count() === 1, 'tela do admin mostra o endereço ativo da Infoxtec')
await p.fill('#portal-slug', 'infoxtec-t2'); await p.waitForTimeout(1500)
await p.getByRole('button', { name: 'Salvar' }).last().click(); await p.waitForTimeout(8000)
ok(await p.locator('[data-endereco="atendimento.infoxtec-t2.dev.vluma.com.br"]').count() === 1, 'trocar o nome curto cria o endereço novo automaticamente')
for (let i = 0; i < 14; i++) { if (await p.locator('[data-endereco="atendimento.infoxtec-t2.dev.vluma.com.br"][data-situacao="ativo"]').count()) break; await p.waitForTimeout(10000) }
ok(await p.locator('[data-endereco="atendimento.infoxtec-t2.dev.vluma.com.br"][data-situacao="ativo"]').count() === 1, 'a tela acompanha sozinha até o endereço novo ficar ativo')
ok((await p.locator('[data-testid=portal-enderecos]').innerText()).includes('endereço antigo'), 'o endereço anterior aparece como "endereço antigo"')
const cli = await (await b.newContext()).newPage()
await cli.goto(OLD + '/termos/uso'); await cli.waitForTimeout(6000)
ok(cli.url().startsWith(NEW + '/termos/uso'), 'cliente no endereço ANTIGO é levado ao novo, na mesma página: ' + cli.url())
// desfaz
await p.fill('#portal-slug', 'infoxtec'); await p.waitForTimeout(1500)
await p.getByRole('button', { name: 'Salvar' }).last().click(); await p.waitForTimeout(8000)
const r = sql(`select host, situacao, principal from portal_enderecos where tenant_id='30752cf0-fbfa-419b-afe4-75e06d6992f5' and situacao<>'removido' order by host`)
ok(r.find(x => x.host === 'atendimento.infoxtec.dev.vluma.com.br')?.principal === true, 'voltar ao nome curto original devolve o endereço original como principal')
console.log(r); await b.close(); console.log(f ? f + ' FALHA(S)' : 'TUDO OK')
