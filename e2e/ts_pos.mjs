import { T, SB, anon, sql, ok, resumo } from './lib.mjs'
const chamar = async body => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + anon, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() } }
sql(`delete from portal_solicitacoes_acesso where email like 'e3ts.%'`)
let r = await chamar({ acao: 'solicitar', tenant_id: T, nome: 'Com Verificacao', email: 'e3ts.ok@example.com', cliente: 'Cliente Trigger Teste', turnstile: 'XXXX.DUMMY.TOKEN.XXXX' })
ok(r.s === 200 && r.j.ok, 'servidor: com verificação válida (chave de teste da Cloudflare) o pedido é aceito')
ok(sql(`select count(*)::int n from portal_solicitacoes_acesso where email='e3ts.ok@example.com'`)[0].n === 1, 'e gravado')
sql(`delete from portal_solicitacoes_acesso where email like 'e3ts.%'`); resumo()
