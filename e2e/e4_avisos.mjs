import { SB, anon, T, cred, sql, ok, resumo, token } from './lib.mjs'
const srk = (await import('fs')).readFileSync((process.env.ATOS_SCRATCH || '/tmp/atos-scratch') + '/.srk', 'utf8').trim()
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const P = sql(`select user_id from portal_pessoas where email='portal.teste@example.com'`)[0].user_id
const TERMO = sql(`select id from termos where tenant_id is null and tipo='comunicacao' limit 1`)[0].id
const limpar = () => sql(`delete from orders where title like 'E4AV %'; delete from portal_preferencias where user_id='${P}'`)
limpar()
const mkOrder = (titulo) => sql(`insert into orders (tenant_id, client_id, title, tipo, priority, origem, solicitante_id) values ('${T}','${CLI}','${titulo}','incidente','baixo','portal','${P}') returning id, number`)[0]
const aviso = (id, ev) => sql(`select enviado, motivo, detalhe from portal_avisos where order_id='${id}' and evento like '${ev}%' order by id desc limit 1`)[0]
const espera = ms => new Promise(r => setTimeout(r, ms))
async function esperar(id, ev) { for (let i = 0; i < 15; i++) { const a = aviso(id, ev); if (a) return a; await espera(1500) } return null }
// consentimento aceito + canal ligado
sql(`delete from termos_aceites where user_id='${P}' and tenant_id='${T}' and termo_id in (select id from termos where tipo='comunicacao'); insert into termos_aceites (user_id, tenant_id, termo_id, canal) values ('${P}','${T}','${TERMO}','portal')`)
sql(`update tenants set portal_abertura = '{}' where id='${T}'`)
let o = mkOrder('E4AV com consentimento')
let a = await esperar(o.id, 'aberto')
ok(a && a.motivo === 'dominio_reservado' && /Recebemos o seu chamado OS-/.test(a.detalhe) && /\/chamados\//.test(a.detalhe), 'abrir o chamado dispara o aviso "Recebemos o seu chamado" com o link (e-mail de teste não é enviado de verdade)')
sql(`update orders set status='em_andamento' where id='${o.id}'`); a = await esperar(o.id, 'em_atendimento')
ok(a && /em atendimento/.test(a.detalhe), 'em atendimento → aviso')
sql(`update orders set status='agendada', scheduled_at = now() + interval '3 days' where id='${o.id}'`); a = await esperar(o.id, 'agendada')
ok(a && /foi agendado/.test(a.detalhe), 'agendada → aviso')
sql(`update orders set status='concluida', completed_at=now() where id='${o.id}'`); a = await esperar(o.id, 'resolvido')
ok(a && /foi resolvido/.test(a.detalhe), 'resolvido → aviso')
// sem consentimento
sql(`update termos_aceites set revogado_em = now() where user_id='${P}' and tenant_id='${T}'`)
o = mkOrder('E4AV sem consentimento'); a = await esperar(o.id, 'aberto')
ok(a && a.enviado === false && a.motivo === 'sem_consentimento', 'sem o consentimento de comunicação (LGPD) NÃO envia')
// canal desligado pela pessoa
sql(`update termos_aceites set revogado_em = null where user_id='${P}' and tenant_id='${T}'; insert into portal_preferencias (user_id, tenant_id, canal_email) values ('${P}','${T}', false) on conflict (user_id, tenant_id) do update set canal_email=false`)
o = mkOrder('E4AV canal desligado'); a = await esperar(o.id, 'aberto')
ok(a && a.motivo === 'canal_desligado', 'canal e-mail desligado pela pessoa → não envia')
// canal não liberado pela empresa
sql(`update portal_preferencias set canal_email=true where user_id='${P}'; update tenants set portal_abertura = '{"canais":{"email":false}}' where id='${T}'`)
o = mkOrder('E4AV empresa sem canal'); a = await esperar(o.id, 'aberto')
ok(a && a.motivo === 'canal_nao_liberado', 'empresa não liberou o e-mail → não envia')
sql(`update tenants set portal_abertura = '{}' where id='${T}'`)
// OS interna (sem solicitante) nunca avisa
const interno = sql(`insert into orders (tenant_id, client_id, title, tipo, priority) values ('${T}','${CLI}','E4AV interna','incidente','baixo') returning id`)[0]
await espera(5000)
ok(sql(`select count(*)::int n from portal_avisos where order_id='${interno.id}'`)[0].n === 0, 'OS aberta pela equipe (sem solicitante do portal) não gera aviso')
// idempotência: mesmo evento via chamada direta não duplica
const r = await fetch(SB + '/functions/v1/portal-avisos', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + srk, 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: o.id, evento: 'aberto' }) })
ok(sql(`select count(*)::int n from portal_avisos where order_id='${o.id}' and evento='aberto'`)[0].n === 1, 'um aviso por chamado e evento (sem duplicar)')
limpar(); sql(`update portal_preferencias set canal_email=true where user_id='${P}'`); resumo()
