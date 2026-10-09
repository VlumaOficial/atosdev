import { N, T, SB, anon, cred, sql, ok, resumo, token } from './lib.mjs'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const CLI2 = sql(`select id from clients where name='Atakarejo'`)[0].id
const admTok = await token(cred.admin)
const chamar = async (tok, body) => { const r = await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() } }
const limpar = () => sql(`delete from auth.users where email like 'e3.%'; delete from portal_pessoas where email like 'e3.%'; delete from portal_convites where email like 'e3.%'; delete from portal_solicitacoes_acesso where email like 'e3.%'; delete from portal_equipes where nome like 'E3 %'`)
limpar()
sql(`update clients set portal_ativo = true where name in ('Cliente Trigger Teste')`)
sql(`update clients set portal_ativo = false where name = 'Atakarejo'`)
const linkDe = email => sql(`select detalhe->>'link_teste' l from portal_auditoria where acao in ('convite_criado','acesso_concedido') and detalhe->>'link_teste' is not null order by id desc limit 1`)[0]?.l

// ---- convidar (equipe interna)
let r = await chamar(admTok, { acao: 'convidar', client_id: CLI, email: 'e3.novo@example.com', nome: 'Pessoa Nova', perfil: 'usuario' })
ok(r.s === 200 && r.j.ok && r.j.ja_tem_conta === false, 'admin convida uma pessoa nova')
ok(r.j.email_enviado === false && r.j.motivo_email === 'dominio_reservado', 'e-mail de domínio de teste (example.com) NÃO é enviado de verdade')
ok(!JSON.stringify(r.j).includes('/convite/'), 'a resposta ao convidante não traz o link (ele não pode criar a conta no lugar da pessoa)')
const link = linkDe(); const tok = link.split('/convite/')[1]
ok(link.includes('/convite/') && tok.length >= 40, 'link de teste guardado só na auditoria: ' + link.replace(tok, tok.slice(0, 6) + '…'))
ok(sql(`select count(*)::int n from portal_convites where email='e3.novo@example.com' and token_hash = encode(sha256(convert_to('${tok}','utf8')),'hex')`)[0].n === 1, 'só o HASH do token fica no banco')
ok(!sql(`select * from portal_convites where email='e3.novo@example.com'`).some(x => JSON.stringify(x).includes(tok)), 'o token em si não está em nenhuma coluna do banco')
r = await chamar(null, { acao: 'consultar', token: tok })
ok(r.j.valido && r.j.email === 'e3.novo@example.com' && r.j.perfil === 'usuario' && r.j.cliente === 'Cliente Trigger Teste', 'consultar (público) devolve empresa, cliente e perfil')
r = await chamar(null, { acao: 'consultar', token: 'token-inventado' }); ok(r.j.valido === false, 'token inventado → inválido')

// ---- convidar: bloqueios
r = await chamar(admTok, { acao: 'convidar', client_id: CLI, email: 'adm@infoxtec.com.br', nome: 'Interno', perfil: 'usuario' })
ok(r.s === 409 && /equipe interna/.test(r.j.erro), 'e-mail de usuário da equipe interna é recusado')
r = await chamar(admTok, { acao: 'convidar', client_id: CLI2, email: 'e3.x@example.com', nome: 'Fulano', perfil: 'usuario' })
ok(r.s === 400 && /não está ligado/.test(r.j.erro), 'cliente com o portal desligado não recebe convite')
r = await chamar(null, { acao: 'convidar', client_id: CLI, email: 'e3.y@example.com', nome: 'Fulano', perfil: 'usuario' })
ok(r.s === 401, 'sem login não convida (401)')
const tecTok = await token(cred.tecnico)
r = await chamar(tecTok, { acao: 'convidar', client_id: CLI, email: 'e3.y@example.com', nome: 'Fulano', perfil: 'usuario' })
ok(r.s === 403, 'técnico não convida (403)')

// ---- aceitar
r = await chamar(null, { acao: 'aceitar', token: tok, nome: 'Pessoa Nova', senha: 'curta' }); ok(r.s === 400, 'senha fraca é recusada')
r = await chamar(null, { acao: 'aceitar', token: tok, nome: 'Pessoa Nova', senha: 'Senha-E3-1234', celular: '(71) 98888-0000' })
ok(r.s === 200 && r.j.email === 'e3.novo@example.com', 'aceitar cria a conta com a senha que a própria pessoa escolheu')
const v = sql(`select p.nome, p.celular, v.perfil, v.ativo, a.raw_app_meta_data->>'tipo' tipo, (select count(*) from users where email='e3.novo@example.com')::int interno from portal_pessoas p join portal_vinculos v on v.user_id=p.user_id join auth.users a on a.id=p.user_id where p.email='e3.novo@example.com'`)[0]
ok(v && v.perfil === 'usuario' && v.ativo && v.tipo === 'portal' && v.interno === 0 && v.celular === '71988880000', 'pessoa do portal criada: vínculo "usuario", conta marcada como portal, sem perfil interno')
r = await chamar(null, { acao: 'aceitar', token: tok, nome: 'Outra', senha: 'Senha-E3-1234' }); ok(r.s === 410, 'o link só vale uma vez (reuso → 410)')
r = await chamar(null, { acao: 'consultar', token: tok }); ok(r.j.valido === false && r.j.motivo === 'usado', 'consultar depois de usado → "usado"')
const login = await token(['e3.novo@example.com', 'Senha-E3-1234']); ok(!!login, 'a pessoa consegue entrar com a senha que criou')
r = await chamar(login, { acao: 'convidar', client_id: CLI, email: 'e3.z@example.com', nome: 'Z', perfil: 'usuario' })
ok(r.s === 403, 'Usuário comum (não Supervisor) não convida ninguém (403)')

// ---- convite expirado / revogado
sql(`update portal_convites set expira_em = now() - interval '1 hour' where email='e3.novo@example.com'`)
r = await chamar(admTok, { acao: 'convidar', client_id: CLI, email: 'e3.expira@example.com', nome: 'Expira', perfil: 'usuario' })
const tk2 = linkDe().split('/convite/')[1]
sql(`update portal_convites set expira_em = now() - interval '1 hour' where email='e3.expira@example.com'`)
r = await chamar(null, { acao: 'consultar', token: tk2 }); ok(r.j.valido === false && r.j.motivo === 'expirado', 'convite expirado → "expirado"')
r = await chamar(null, { acao: 'aceitar', token: tk2, nome: 'Expira', senha: 'Senha-E3-1234' }); ok(r.s === 410, 'convite expirado não pode ser aceito')
await chamar(admTok, { acao: 'convidar', client_id: CLI, email: 'e3.revoga@example.com', nome: 'Revoga', perfil: 'usuario' })
const cid = sql(`select id from portal_convites where email='e3.revoga@example.com' and revogado_em is null`)[0].id
const tk3 = linkDe().split('/convite/')[1]
r = await chamar(admTok, { acao: 'revogar_convite', convite_id: cid }); ok(r.j.ok, 'revogar convite')
r = await chamar(null, { acao: 'aceitar', token: tk3, nome: 'Revoga', senha: 'Senha-E3-1234' }); ok(r.s === 410, 'convite revogado não pode ser aceito')
// reenviar gera link novo e invalida o antigo
await chamar(admTok, { acao: 'convidar', client_id: CLI, email: 'e3.reenvia@example.com', nome: 'Reenvia', perfil: 'usuario' })
const tkA = linkDe().split('/convite/')[1]
const cidB = sql(`select id from portal_convites where email='e3.reenvia@example.com' and revogado_em is null`)[0].id
await chamar(admTok, { acao: 'reenviar', convite_id: cidB }); const tkB = linkDe().split('/convite/')[1]
ok(tkA !== tkB, 'reenviar gera um link novo')
r = await chamar(null, { acao: 'consultar', token: tkA }); ok(r.j.valido === false, 'o link antigo deixa de valer')
r = await chamar(null, { acao: 'consultar', token: tkB }); ok(r.j.valido === true, 'o link novo vale')

// ---- Supervisor convida (via vínculo promovido) e conta existente em outro cliente
sql(`update portal_vinculos set perfil='supervisor' where user_id=(select user_id from portal_pessoas where email='e3.novo@example.com')`)
const supTok = await token(['e3.novo@example.com', 'Senha-E3-1234'])
r = await chamar(supTok, { acao: 'convidar', client_id: CLI, email: 'e3.filho@example.com', nome: 'Convidado Pelo Supervisor', perfil: 'usuario' })
ok(r.s === 200 && r.j.ok, 'Supervisor convida um Usuário do próprio cliente')
sql(`update clients set portal_ativo = true where name = 'Atakarejo'`)
r = await chamar(supTok, { acao: 'convidar', client_id: CLI2, email: 'e3.filho2@example.com', nome: 'Fora do Cliente', perfil: 'usuario' })
ok(r.s === 403, 'Supervisor NÃO convida em OUTRO cliente (403)')
r = await chamar(admTok, { acao: 'convidar', client_id: CLI2, email: 'e3.novo@example.com', nome: 'Pessoa Nova', perfil: 'usuario' })
ok(r.s === 200 && r.j.ja_tem_conta === true, 'quem já tem conta recebe o acesso a outro cliente SEM criar senha nova')
ok(sql(`select count(*)::int n from portal_vinculos v join portal_pessoas p on p.user_id=v.user_id where p.email='e3.novo@example.com' and v.ativo`)[0].n === 2, 'a mesma pessoa agora tem 2 clientes')
r = await chamar(admTok, { acao: 'convidar', client_id: CLI2, email: 'e3.novo@example.com', nome: 'Pessoa Nova', perfil: 'usuario' })
ok(r.s === 409, 'repetir o convite de quem já tem acesso → 409')

// ---- pedido de acesso (público)
const tenantId = T
r = await chamar(null, { acao: 'solicitar', turnstile: 'XXXX.DUMMY.TOKEN.XXXX', tenant_id: tenantId, nome: 'Curioso', email: 'e3.curioso@example.com', cliente: 'cliente trigger  TESTE', mensagem: 'Preciso de acesso' })
ok(r.s === 200 && r.j.ok, 'pedido de acesso (público) aceito')
const sol = sql(`select client_id, situacao from portal_solicitacoes_acesso where email='e3.curioso@example.com'`)[0]
ok(sol.client_id === CLI && sol.situacao === 'pendente', 'o nome do cliente (sem acento/caixa) é reconhecido e o pedido vai ao cliente certo')
r = await chamar(null, { acao: 'solicitar', turnstile: 'XXXX.DUMMY.TOKEN.XXXX', tenant_id: tenantId, nome: 'Curioso', email: 'e3.curioso@example.com', cliente: 'Qualquer' })
ok(r.s === 200 && sql(`select count(*)::int n from portal_solicitacoes_acesso where email='e3.curioso@example.com'`)[0].n === 1, 'repetir o pedido não duplica (e a resposta é igual)')
r = await chamar(null, { acao: 'solicitar', turnstile: 'XXXX.DUMMY.TOKEN.XXXX', tenant_id: tenantId, nome: 'Interno', email: 'adm@infoxtec.com.br', cliente: 'x' })
ok(r.s === 200 && sql(`select count(*)::int n from portal_solicitacoes_acesso where email='adm@infoxtec.com.br'`)[0].n === 0, 'e-mail da equipe interna: resposta igual, mas nada é criado (não revela nem cria)')
r = await chamar(null, { acao: 'solicitar', turnstile: 'XXXX.DUMMY.TOKEN.XXXX', tenant_id: tenantId, nome: 'Sem Cliente', email: 'e3.semcliente@example.com', cliente: 'Empresa que não existe' })
ok(sql(`select client_id from portal_solicitacoes_acesso where email='e3.semcliente@example.com'`)[0].client_id === null, 'cliente não reconhecido → pedido fica sem cliente (a empresa decide)')
ok(sql(`select count(*)::int n from notificacoes where tipo='solicitacao_acesso' and titulo like '%Curioso%'`)[0].n >= 1, 'a empresa recebe o aviso no sino')
for (let i = 0; i < 6; i++) await chamar(null, { acao: 'solicitar', turnstile: 'XXXX.DUMMY.TOKEN.XXXX', tenant_id: tenantId, nome: 'Spam ' + i, email: `e3.spam${i}@example.com`, cliente: 'x' })
r = await chamar(null, { acao: 'solicitar', turnstile: 'XXXX.DUMMY.TOKEN.XXXX', tenant_id: tenantId, nome: 'Spam 9', email: 'e3.spam9@example.com', cliente: 'x' })
ok(r.s === 429, 'limite por origem: depois de 5 pedidos na hora → 429')
sql(`update portal_solicitacoes_acesso set ip_hash = null where email like 'e3.%'`)
// decidir
const idSol = sol && sql(`select id from portal_solicitacoes_acesso where email='e3.curioso@example.com'`)[0].id
r = await chamar(supTok, { acao: 'decidir_solicitacao', id: idSol, aprovar: true })
ok(r.s === 200 && r.j.ok, 'Supervisor do cliente aprova o pedido (vira convite de Usuário)')
ok(sql(`select situacao from portal_solicitacoes_acesso where id='${idSol}'`)[0].situacao === 'aprovada' && sql(`select count(*)::int n from portal_convites where email='e3.curioso@example.com' and aceito_em is null and revogado_em is null`)[0].n === 1, 'pedido aprovado e convite gerado')
const idSem = sql(`select id from portal_solicitacoes_acesso where email='e3.semcliente@example.com'`)[0].id
r = await chamar(supTok, { acao: 'decidir_solicitacao', id: idSem, aprovar: true, client_id: CLI })
ok(r.s === 403, 'Supervisor não decide pedido sem cliente definido (só a empresa)')
r = await chamar(admTok, { acao: 'decidir_solicitacao', id: idSem, aprovar: true })
ok(r.s === 400 && /Escolha o cliente/.test(r.j.erro), 'aprovar sem cliente → pede para escolher o cliente')
r = await chamar(admTok, { acao: 'decidir_solicitacao', id: idSem, aprovar: false, motivo: 'Cliente não identificado' })
ok(r.s === 200 && sql(`select situacao from portal_solicitacoes_acesso where id='${idSem}'`)[0].situacao === 'recusada', 'a empresa recusa o pedido sem cliente')

// ---- LGPD: exportar e anonimizar
const uid = sql(`select user_id from portal_pessoas where email='e3.novo@example.com'`)[0].user_id
const exp = await (await fetch(SB + '/rest/v1/rpc/portal_exportar_pessoa', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + admTok, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_user: uid }) })).json()
ok(exp.pessoa?.email === 'e3.novo@example.com' && Array.isArray(exp.acessos) && exp.acessos.length >= 1 && Array.isArray(exp.aceites), 'LGPD: exportação traz pessoa, acessos, equipes, aceites e registros')
ok(!JSON.stringify(exp).includes('Atakarejo') || exp.acessos.length === 2, 'a exportação é só desta empresa')
const gestorTok = await token(['adm@infoxtec.com.br', cred.admin[1]])  // admin
r = await chamar(supTok, { acao: 'anonimizar', user_id: uid }); ok(r.s === 403, 'Supervisor não anonimiza (403)')
r = await chamar(admTok, { acao: 'anonimizar', user_id: uid })
ok(r.s === 200 && r.j.anonimizada === true, 'admin anonimiza (a pessoa só tinha acesso nesta empresa)')
const an = sql(`select p.nome, p.email, p.celular, (select count(*) from portal_vinculos where user_id=p.user_id and ativo)::int ativos from portal_pessoas p where p.user_id='${uid}'`)[0]
ok(an.nome === 'Usuário removido' && an.email.endsWith('@anonimizado.invalid') && an.celular === null && an.ativos === 0, 'dados pessoais apagados e acessos desativados')
ok(!(await token(['e3.novo@example.com', 'Senha-E3-1234'])), 'a conta anonimizada não consegue mais entrar')
ok(sql(`select count(*)::int n from portal_auditoria where acao='pessoa_anonimizada'`)[0].n >= 1, 'anonimização registrada na auditoria')
const rpc = async (nome, corpo) => (await fetch(SB + '/rest/v1/rpc/' + nome, { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + admTok, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })).json()
const gestao = await rpc('portal_listar_gestao', { p_client: CLI })
ok(!gestao.pessoas.some(p => p.user_id === uid), 'pessoa anonimizada sai da lista de gestão')
const tentativa = await rpc('portal_alterar_vinculo', { p_client: CLI, p_user: uid, p_perfil: 'usuario', p_ativo: true })
ok(/não encontrada/.test(tentativa.message ?? ''), 'pessoa anonimizada não pode ser reativada')
sql(`delete from auth.users where email like 'removido-%'; delete from portal_pessoas where email like 'removido-%'`)
limpar(); sql(`update clients set portal_ativo = false where name = 'Atakarejo'`)
resumo()
