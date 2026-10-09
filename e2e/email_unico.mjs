// Garante que NÃO dá para cadastrar e-mail que já existe na base (equipe interna ou portal), por qualquer caminho.
import { T, SB, anon, cred, sql, ok, resumo, token } from './lib.mjs'
const admTok = await token(cred.admin)
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const post = async (fn, tok, body) => { const r = await fetch(SB + '/functions/v1/' + fn, { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); let j = {}; try { j = await r.json() } catch {} return { s: r.status, j } }
const limpar = () => sql(`delete from auth.users where email like 'e6em.%'; delete from public.users where email like 'e6em.%'; delete from portal_pessoas where email like 'e6em.%'; delete from portal_convites where email like 'e6em.%'; delete from portal_solicitacoes_acesso where email like 'e6em.%'`)
limpar()
sql(`update clients set portal_ativo = true where name = 'Cliente Trigger Teste'`)
const n = (e) => sql(`select (select count(*) from auth.users where lower(email)=lower('${e}'))::int a, (select count(*) from public.users where lower(email)=lower('${e}'))::int u, (select count(*) from portal_pessoas where lower(email)=lower('${e}'))::int p`)[0]
const criar = (email, role = 'atendente') => post('criar-tecnico', admTok, { name: 'E6EM Pessoa', email, password: 'Senha-E6em-123', role })

// 1) equipe interna: cria uma vez, repete igual, repete com outra caixa e com espaços
let r = await criar('e6em.interno@example.com'); ok(r.s === 200 || r.j.ok || r.j.user_id || r.j.id, 'cria o usuário interno uma vez ' + JSON.stringify(r.j).slice(0, 80))
r = await criar('e6em.interno@example.com'); ok(r.s === 400 && /já existe/i.test(r.j.error ?? ''), 'repetir o mesmo e-mail é recusado: ' + (r.j.error ?? r.s))
r = await criar('E6EM.Interno@Example.com'); ok(r.s === 400, 'mesmo e-mail com MAIÚSCULAS é recusado: ' + (r.j.error ?? r.s))
r = await criar('  e6em.interno@example.com  '); ok(r.s === 400, 'mesmo e-mail com espaços é recusado: ' + (r.j.error ?? r.s))
let c = n('e6em.interno@example.com'); ok(c.a === 1 && c.u === 1, `continua 1 só na base (auth ${c.a}, users ${c.u})`)

// 2) e-mail de quem já é do portal não vira usuário interno
r = await post('portal-acesso', admTok, { acao: 'convidar', client_id: CLI, email: 'e6em.portal@example.com', nome: 'E6EM Portal', perfil: 'usuario' })
const tk = sql(`select detalhe->>'link_teste' l from portal_auditoria where detalhe->>'link_teste' is not null order by id desc limit 1`)[0].l.split('/convite/')[1]
await post('portal-acesso', null, { acao: 'aceitar', token: tk, nome: 'E6EM Portal', senha: 'Senha-E6em-123' })
ok(n('e6em.portal@example.com').p === 1, 'pessoa do portal criada')
r = await criar('e6em.portal@example.com'); ok(r.s === 400, 'e-mail de pessoa do portal NÃO vira usuário interno: ' + (r.j.error ?? r.s))
r = await criar('E6EM.PORTAL@example.com', 'gestor'); ok(r.s === 400, '… nem com outra caixa')
c = n('e6em.portal@example.com'); ok(c.a === 1 && c.u === 0 && c.p === 1, `a pessoa continua só no portal (auth ${c.a}, users ${c.u}, portal ${c.p})`)

// 3) o portal não aceita e-mail da equipe interna, em nenhuma caixa
for (const e of ['e6em.interno@example.com', 'E6EM.INTERNO@example.com', 'adm@infoxtec.com.br', 'ADM@INFOXTEC.COM.BR']) {
  r = await post('portal-acesso', admTok, { acao: 'convidar', client_id: CLI, email: e, nome: 'Interno', perfil: 'usuario' })
  ok(r.s === 409, `convite para e-mail interno (${e}) recusado: ${r.j.erro ?? r.s}`)
}
// 4) pedido público com e-mail interno não cria nada
r = await post('portal-acesso', null, { acao: 'solicitar', tenant_id: T, nome: 'Interno', email: 'E6EM.interno@example.com', cliente: 'x' })
ok(sql(`select count(*)::int n from portal_solicitacoes_acesso where lower(email)='e6em.interno@example.com'`)[0].n === 0, 'pedido de acesso com e-mail interno não é criado')
// 5) convidar quem já é do portal (outra caixa) não cria conta duplicada
r = await post('portal-acesso', admTok, { acao: 'convidar', client_id: CLI, email: 'E6EM.Portal@example.com', nome: 'E6EM Portal', perfil: 'usuario' })
ok(r.s === 409 || r.j.ja_tem_conta === true, `convidar quem já tem conta (outra caixa) reaproveita a conta: ${r.j.erro ?? JSON.stringify(r.j).slice(0, 60)}`)
ok(n('e6em.portal@example.com').a === 1, 'continua 1 só conta de acesso')
// 6) cadastro aberto continua fechado
const su = await fetch(SB + '/auth/v1/signup', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'e6em.aberto@example.com', password: 'Senha-E6em-123' }) })
ok(su.status >= 400, 'cadastro público (signUp) continua fechado: HTTP ' + su.status)
// 7) rede de proteção no banco: as tabelas do app também recusam e-mail repetido (qualquer caixa), mesmo por escrita direta
r = await criar('e6em.outro@example.com')
const tenta = (q) => { const x = sql(q); return x && x.message ? x.message : 'PASSOU' }
let m = tenta(`update public.users set email='E6EM.Interno@Example.com' where lower(email)='e6em.outro@example.com'`)
ok(/duplicate|unique|já existe|exist/i.test(m), 'public.users recusa trocar para e-mail repetido (outra caixa): ' + m.slice(0, 110))
m = tenta(`update public.users set email='e6em.portal@example.com' where lower(email)='e6em.outro@example.com'`)
ok(/duplicate|unique|já existe|exist|portal/i.test(m), 'public.users recusa e-mail que já é de pessoa do portal: ' + m.slice(0, 110))
m = tenta(`update portal_pessoas set email='E6EM.Outro@example.com' where lower(email)='e6em.portal@example.com'`)
ok(/duplicate|unique|já existe|exist|equipe/i.test(m), 'portal_pessoas recusa e-mail que já é da equipe interna: ' + m.slice(0, 110))
m = tenta(`update portal_pessoas set email='E6EM.PORTAL@example.com' where lower(email)='e6em.portal@example.com'`)
ok(m === 'PASSOU', 'regravar o próprio e-mail continua permitido')
limpar(); resumo()
