// Acesso ao portal de atendimento (E3 do portal): convites, aceite, pedidos de
// acesso e anonimização (LGPD).
//
// Ações (POST JSON { acao, ... }):
//   públicas (sem login):
//     consultar          { token }                        → dados do convite (para a tela de aceite)
//     aceitar            { token, nome, senha, celular? } → cria a conta e o vínculo
//     solicitar          { tenant_id, nome, email, ... }  → pedido de acesso (anti-robô + limite)
//   autenticadas (equipe interna admin/gestor ou Supervisor do cliente):
//     convidar           { client_id, email, nome, perfil, equipes? }
//     reenviar           { convite_id }
//     revogar_convite    { convite_id }
//     decidir_solicitacao{ id, aprovar, client_id?, perfil?, motivo? }
//   somente administrador:
//     anonimizar         { user_id }
//
// Segurança:
//   * o Supervisor NUNCA define a senha de ninguém: o convite leva um link de uso
//     único (token de 256 bits; só o hash fica no banco; vale 7 dias) e a pessoa cria
//     a própria senha
//   * o token nunca é devolvido a quem convida (senão ele criaria a conta no lugar
//     da pessoa). Exceção de TESTE: e-mails de domínios reservados (example.com, .test,
//     .invalid…) não existem de verdade; nesses o link vai para o registro de auditoria
//   * e-mail de usuário da equipe interna não vira conta de portal
//   * quem já tem conta em outro portal recebe o acesso sem criar senha nova
//   * resposta do "Solicitar acesso" é sempre a mesma (não revela e-mails nem clientes)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const URL_SB = Deno.env.get('SUPABASE_URL') ?? ''
const admin = createClient(URL_SB, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
const SITE = Deno.env.get('SITE_URL') ?? 'https://atosdev.vluma.com.br'

const EMAIL_OK = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 160
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const RESERVADO = (e: string) => /@([a-z0-9-]+\.)*(example\.(com|org|net)|test|invalid|example|localhost)$/i.test(e)
const mascarar = (e: string) => { const [u, d] = e.split('@'); return `${u.charAt(0)}***@${d}` }

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function senhaAleatoria(): string { return novoToken() + 'Aa1' }

// ---------- e-mail (mesma escolha de remetente do envio de relatórios) ----------
function criarCliente(host: string, usuario: string, senha: string) {
  const t = nodemailer.createTransport({ host, port: 465, secure: true, auth: { user: usuario, pass: senha }, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000 })
  return { send: (m: { from: string; to: string; replyTo?: string; subject: string; text: string; html: string }) => t.sendMail(m), close: () => t.close() }
}

async function enviarEmail(tenantId: string, para: string, assunto: string, texto: string, html: string): Promise<{ ok: boolean; motivo?: string }> {
  if (RESERVADO(para)) return { ok: false, motivo: 'dominio_reservado' }   // nunca envia para domínios de teste
  const [{ data: t }, { data: cfg }] = await Promise.all([
    admin.from('tenants').select('name, trade_name, email, envio_nivel').eq('id', tenantId).single(),
    admin.from('tenant_envio_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
  ])
  const empresa = ((t?.trade_name || t?.name || 'Empresa') as string).replace(/[<>"]/g, '')
  try {
    let smtp: ReturnType<typeof criarCliente>, from: string, replyTo: string | undefined
    if (cfg?.smtp_ativo && t?.envio_nivel !== 'basico') {
      const { data: senha } = await admin.rpc('ler_senha_smtp', { p_tenant: tenantId })
      if (!senha || !cfg.smtp_host || !cfg.smtp_usuario) throw new Error('e-mail próprio incompleto')
      smtp = criarCliente(cfg.smtp_host, cfg.smtp_usuario, senha as string)
      from = `${cfg.smtp_remetente_nome || empresa} <${cfg.smtp_email_remetente || cfg.smtp_usuario}>`
    } else {
      smtp = criarCliente(Deno.env.get('SMTP_PADRAO_HOST') ?? 'smtp.zoho.com', Deno.env.get('SMTP_PADRAO_USUARIO') ?? '', Deno.env.get('SMTP_PADRAO_SENHA') ?? '')
      from = `${empresa} via ATOS <${Deno.env.get('SMTP_PADRAO_USUARIO')}>`
      replyTo = t?.email || undefined
    }
    await smtp.send({ from, to: para, replyTo, subject: assunto, text: texto, html })
    smtp.close()
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: (e as Error).message?.slice(0, 120) ?? 'falha no envio' }
  }
}

function moldura(titulo: string, corpoHtml: string, botao?: { texto: string; link: string }, rodape?: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
  <h2 style="font-size:18px;margin:0 0 16px">${esc(titulo)}</h2>
  ${corpoHtml}
  ${botao ? `<p style="margin:24px 0"><a href="${esc(botao.link)}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:bold">${esc(botao.texto)}</a></p>
  <p style="font-size:12px;color:#6b7280">Se o botão não abrir, copie este endereço no navegador:<br>${esc(botao.link)}</p>` : ''}
  ${rodape ? `<p style="font-size:12px;color:#6b7280;margin-top:20px">${rodape}</p>` : ''}
  <p style="font-size:11px;color:#9ca3af;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">Tecnologia ATOS · VLUMA</p></div>`
}

// ---------- apoio ----------
async function auditar(tenantId: string, userId: string | null, acao: string, detalhe: Record<string, unknown> = {}) {
  await admin.from('portal_auditoria').insert({ tenant_id: tenantId, user_id: userId, acao, detalhe })
}

async function linkBase(tenantId: string, slug: string | null): Promise<string> {
  const { data: e } = await admin.from('portal_enderecos').select('host').eq('tenant_id', tenantId).eq('situacao', 'ativo').eq('principal', true).limit(1).maybeSingle()
  return e?.host ? `https://${e.host}` : `${SITE}/portal/${slug}`
}

async function dadosPortal(tenantId: string) {
  const { data: t } = await admin.from('tenants').select('id, name, trade_name, portal_nome, portal_slug, portal_habilitado, portal_ativo').eq('id', tenantId).single()
  const empresa = (t?.trade_name || t?.name || 'Empresa') as string
  return { t, empresa, portalNome: (t?.portal_nome as string | null) || `Central de Atendimento ${empresa}` }
}

// ---------- criar o acesso de uma pessoa a um cliente (convite novo ou vínculo direto) ----------
async function darAcesso(opts: { clientId: string; email: string; nome: string; perfil: 'supervisor' | 'usuario'; equipes: string[]; por: string | null; celular?: string | null }) {
  const { data: cli } = await admin.from('clients').select('id, name, tenant_id, portal_ativo, active').eq('id', opts.clientId).single()
  if (!cli) return { erro: 'Cliente não encontrado.', status: 404 }
  const { t, empresa, portalNome } = await dadosPortal(cli.tenant_id)
  if (!t?.portal_habilitado || !t.portal_ativo || !cli.portal_ativo || !cli.active) return { erro: 'O portal deste cliente não está ligado. A empresa precisa ligá-lo primeiro.', status: 400 }
  const email = opts.email.trim().toLowerCase()
  if (!EMAIL_OK(email)) return { erro: 'E-mail inválido.', status: 400 }
  if (opts.nome.trim().length < 2) return { erro: 'Informe o nome.', status: 400 }

  const { data: interno } = await admin.from('users').select('id').ilike('email', email).maybeSingle()
  if (interno) return { erro: 'Este e-mail pertence a um usuário da equipe interna da empresa e não pode ser usado no portal.', status: 409 }

  const equipesOk: string[] = opts.equipes.length
    ? ((await admin.from('portal_equipes').select('id').eq('client_id', opts.clientId).in('id', opts.equipes)).data ?? []).map((e: any) => e.id) : []
  const base = await linkBase(cli.tenant_id, t?.portal_slug ?? null)

  // quem já tem conta (em qualquer portal) recebe o acesso sem criar senha nova
  const { data: pessoa } = await admin.from('portal_pessoas').select('user_id, nome').eq('email', email).maybeSingle()
  if (pessoa) {
    const { data: v } = await admin.from('portal_vinculos').select('id, ativo').eq('client_id', opts.clientId).eq('user_id', pessoa.user_id).maybeSingle()
    if (v?.ativo) return { erro: 'Esta pessoa já tem acesso a este cliente.', status: 409 }
    if (v) await admin.from('portal_vinculos').update({ ativo: true, perfil: opts.perfil, desativado_em: null, desativado_por: null }).eq('id', v.id)
    else await admin.from('portal_vinculos').insert({ user_id: pessoa.user_id, tenant_id: cli.tenant_id, client_id: opts.clientId, perfil: opts.perfil, criado_por: opts.por })
    if (equipesOk.length) await admin.from('portal_equipe_membros').upsert(equipesOk.map(e => ({ equipe_id: e, user_id: pessoa.user_id, tenant_id: cli.tenant_id })))
    const link = base
    const em = await enviarEmail(cli.tenant_id, email, `Você agora tem acesso ao portal ${portalNome}`,
      `Olá, ${pessoa.nome}! Você agora tem acesso ao portal da ${empresa} (${cli.name}). Entre com o seu e-mail e a sua senha de sempre: ${link}`,
      moldura('Acesso liberado', `<p>Olá, <b>${esc(pessoa.nome)}</b>!</p><p>Você agora tem acesso ao portal <b>${esc(portalNome)}</b> da <b>${esc(empresa)}</b>, como ${opts.perfil === 'supervisor' ? 'Supervisor' : 'Usuário'} de <b>${esc(cli.name)}</b>.</p><p>Entre com o seu e-mail e a sua senha de sempre — não é preciso criar outra.</p>`, { texto: 'Abrir o portal', link }))
    await auditar(cli.tenant_id, opts.por, 'acesso_concedido', { client_id: opts.clientId, email: mascarar(email), perfil: opts.perfil, conta_existente: true, email_enviado: em.ok, ...(RESERVADO(email) ? { link_teste: link } : {}) })
    return { ok: true, ja_tem_conta: true, email_enviado: em.ok, motivo_email: em.motivo }
  }

  // pessoa nova: convite com link de uso único
  await admin.from('portal_convites').update({ revogado_em: new Date().toISOString() })
    .eq('client_id', opts.clientId).eq('email', email).is('aceito_em', null).is('revogado_em', null)
  const token = novoToken()
  const { data: c, error } = await admin.from('portal_convites').insert({
    tenant_id: cli.tenant_id, client_id: opts.clientId, email, nome: opts.nome.trim(), perfil: opts.perfil, equipes: equipesOk, celular: opts.celular ?? null,
    token_hash: await sha256(token), criado_por: opts.por,
  }).select('id, expira_em').single()
  if (error || !c) return { erro: 'Não foi possível criar o convite.', status: 500 }
  const link = `${base}/convite/${token}`
  const em = await enviarEmail(cli.tenant_id, email, `Convite para o portal ${portalNome}`,
    `Olá, ${opts.nome.trim()}! A ${empresa} liberou o seu acesso ao portal de atendimento (${cli.name}). Crie a sua senha em: ${link} (o link vale por 7 dias e só pode ser usado uma vez).`,
    moldura('Convite para o portal de atendimento', `<p>Olá, <b>${esc(opts.nome.trim())}</b>!</p><p>A <b>${esc(empresa)}</b> liberou o seu acesso ao portal <b>${esc(portalNome)}</b>, como ${opts.perfil === 'supervisor' ? 'Supervisor' : 'Usuário'} de <b>${esc(cli.name)}</b>. Por lá você abre e acompanha os seus chamados.</p><p>Crie a sua senha pelo botão abaixo.</p>`,
      { texto: 'Criar minha senha', link }, 'O link vale por 7 dias e só pode ser usado uma vez. Se você não esperava este convite, ignore este e-mail.'))
  if (em.ok) await admin.from('portal_convites').update({ email_enviado_em: new Date().toISOString() }).eq('id', c.id)
  await auditar(cli.tenant_id, opts.por, 'convite_criado', { client_id: opts.clientId, email: mascarar(email), perfil: opts.perfil, email_enviado: em.ok, ...(RESERVADO(email) ? { link_teste: link } : {}) })
  return { ok: true, ja_tem_conta: false, email_enviado: em.ok, motivo_email: em.motivo, convite_id: c.id }
}

// ---------- anti-robô (Cloudflare Turnstile) ----------
async function turnstileOk(token: string | undefined, ip: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET')
  if (!secret) return true            // anti-robô só vale quando a chave secreta está configurada
  if (!token) return false
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: ip }), signal: AbortSignal.timeout(8000),
    })
    return !!(await r.json()).success
  } catch { return false }
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const b = await req.json()
    const acao = String(b?.acao ?? '')
    const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()

    // ================= públicas =================
    if (acao === 'consultar') {
      const { data: c } = await admin.from('portal_convites').select('id, tenant_id, client_id, nome, email, celular, perfil, expira_em, aceito_em, revogado_em')
        .eq('token_hash', await sha256(String(b.token ?? ''))).maybeSingle()
      if (!c) return json({ valido: false, motivo: 'invalido' })
      if (c.aceito_em) return json({ valido: false, motivo: 'usado' })
      if (c.revogado_em) return json({ valido: false, motivo: 'revogado' })
      if (new Date(c.expira_em) < new Date()) return json({ valido: false, motivo: 'expirado' })
      const { empresa, portalNome } = await dadosPortal(c.tenant_id)
      const { data: cli } = await admin.from('clients').select('name').eq('id', c.client_id).single()
      return json({ valido: true, empresa, portal: portalNome, cliente: cli?.name, nome: c.nome, email: c.email, celular: c.celular, perfil: c.perfil })
    }

    if (acao === 'aceitar') {
      const senha = String(b.senha ?? '')
      if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return json({ erro: 'A senha deve ter pelo menos 8 caracteres, com letras e números.' }, 400)
      const nome = String(b.nome ?? '').trim()
      if (nome.length < 2 || nome.length > 120) return json({ erro: 'Informe o seu nome.' }, 400)
      const celular = String(b.celular ?? '').replace(/\D/g, '').slice(0, 13) || null
      // marca como aceito de forma atômica (um link só vale uma vez)
      const { data: c } = await admin.from('portal_convites').update({ aceito_em: new Date().toISOString() })
        .eq('token_hash', await sha256(String(b.token ?? ''))).is('aceito_em', null).is('revogado_em', null).gt('expira_em', new Date().toISOString())
        .select('id, tenant_id, client_id, email, celular, perfil, equipes').maybeSingle()
      if (!c) return json({ erro: 'Este convite não é mais válido. Peça um novo a quem convidou você.' }, 410)
      const desfazer = () => admin.from('portal_convites').update({ aceito_em: null }).eq('id', c.id)
      const { data: interno } = await admin.from('users').select('id').ilike('email', c.email).maybeSingle()
      if (interno) { await desfazer(); return json({ erro: 'Este e-mail pertence a um usuário da equipe interna.' }, 409) }
      const { data: criado, error } = await admin.auth.admin.createUser({
        email: c.email, password: senha, email_confirm: true, app_metadata: { tipo: 'portal' }, user_metadata: { name: nome },
      })
      if (error || !criado.user) {
        await desfazer()
        const m = (error?.message ?? '').toLowerCase()
        return json({ erro: m.includes('registered') || m.includes('exists') ? 'Já existe uma conta com este e-mail. Entre com a sua senha, ou use "Esqueci minha senha".' : 'Não foi possível criar a conta. Tente de novo.' }, 400)
      }
      const uid = criado.user.id
      const { error: e2 } = await admin.from('portal_pessoas').insert({ user_id: uid, nome, email: c.email, celular: celular ?? c.celular ?? null })
      if (e2) { await admin.auth.admin.deleteUser(uid); await desfazer(); return json({ erro: 'Não foi possível concluir o cadastro.' }, 500) }
      await admin.from('portal_vinculos').insert({ user_id: uid, tenant_id: c.tenant_id, client_id: c.client_id, perfil: c.perfil })
      const eq = (c.equipes ?? []) as string[]
      if (eq.length) await admin.from('portal_equipe_membros').upsert(eq.map(e => ({ equipe_id: e, user_id: uid, tenant_id: c.tenant_id })))
      await auditar(c.tenant_id, uid, 'convite_aceito', { client_id: c.client_id, perfil: c.perfil })
      return json({ ok: true, email: c.email })
    }

    if (acao === 'solicitar') {
      const resposta = () => json({ ok: true })            // sempre a mesma resposta
      const ipHash = await sha256(ip + '|atos-portal')
      const { data: t } = await admin.from('tenants').select('id, portal_habilitado, portal_ativo').eq('id', String(b.tenant_id ?? '')).maybeSingle()
      if (!t?.portal_habilitado || !t.portal_ativo) return resposta()
      if (!(await turnstileOk(b.turnstile, ip))) return json({ erro: 'Não foi possível confirmar que você não é um robô. Tente de novo.' }, 400)
      const desde = new Date(Date.now() - 3600_000).toISOString()
      const { count } = await admin.from('portal_solicitacoes_acesso').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('criado_em', desde)
      if ((count ?? 0) >= 5) return json({ erro: 'Muitas solicitações em pouco tempo. Tente de novo mais tarde.' }, 429)
      const email = String(b.email ?? '').trim().toLowerCase()
      const nome = String(b.nome ?? '').trim().slice(0, 120)
      if (!EMAIL_OK(email) || nome.length < 2) return json({ erro: 'Informe o seu nome e um e-mail válido.' }, 400)
      const { data: interno } = await admin.from('users').select('id').ilike('email', email).maybeSingle()
      if (interno) return resposta()
      const { data: ja } = await admin.from('portal_solicitacoes_acesso').select('id').eq('tenant_id', t.id).eq('email', email).eq('situacao', 'pendente').maybeSingle()
      if (ja) return resposta()
      const { data: pessoa } = await admin.from('portal_pessoas').select('user_id').eq('email', email).maybeSingle()
      if (pessoa && (await admin.from('portal_vinculos').select('id').eq('tenant_id', t.id).eq('user_id', pessoa.user_id).eq('ativo', true).limit(1)).data?.length) return resposta()
      // o nome do cliente informado confere com um cliente que tem o portal ligado?
      const txt = String(b.cliente ?? '').trim().slice(0, 120)
      const { data: clientes } = await admin.from('clients').select('id, name').eq('tenant_id', t.id).eq('portal_ativo', true).eq('active', true)
      const achado = txt ? (clientes ?? []).find((c: any) => normalizar(c.name) === normalizar(txt)) : null
      const { data: s } = await admin.from('portal_solicitacoes_acesso').insert({
        tenant_id: t.id, client_id: achado?.id ?? null, nome, email, celular: String(b.celular ?? '').replace(/\D/g, '').slice(0, 13) || null,
        cliente_texto: txt || null, mensagem: String(b.mensagem ?? '').trim().slice(0, 500) || null, ip_hash: ipHash,
      }).select('id').single()
      if (s) {
        await admin.from('notificacoes').insert(
          ((await admin.from('users').select('id').eq('tenant_id', t.id).in('role', ['admin', 'gestor']).eq('active', true)).data ?? []).map((u: any) => ({
            tenant_id: t.id, user_id: u.id, tipo: 'solicitacao_acesso', titulo: `Pedido de acesso ao portal — ${nome}`,
            corpo: `${mascarar(email)}${txt ? ' · ' + txt : ''}${achado ? '' : ' · cliente não identificado'}`, link: '/usuarios?aba=solicitacoes',
          })))
        await auditar(t.id, null, 'acesso_solicitado', { email: mascarar(email), cliente_identificado: !!achado })
      }
      return resposta()
    }

    // ================= autenticadas =================
    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = createClient(URL_SB, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ erro: 'Não autenticado.' }, 401)
    const papelNo = async (clientId: string): Promise<string | null> => (await caller.rpc('portal_papel_no_cliente', { p_client: clientId })).data ?? null

    if (acao === 'convidar') {
      if (!b.client_id || !(await papelNo(b.client_id))) return json({ erro: 'Sem permissão.' }, 403)
      if (!['supervisor', 'usuario'].includes(b.perfil)) return json({ erro: 'Perfil inválido.' }, 400)
      const r = await darAcesso({ clientId: b.client_id, email: String(b.email ?? ''), nome: String(b.nome ?? ''), perfil: b.perfil, equipes: Array.isArray(b.equipes) ? b.equipes : [], por: user.id })
      return 'erro' in r ? json({ erro: r.erro }, r.status) : json(r)
    }

    if (acao === 'reenviar' || acao === 'revogar_convite') {
      const { data: c } = await admin.from('portal_convites').select('*').eq('id', b.convite_id).maybeSingle()
      if (!c || !(await papelNo(c.client_id))) return json({ erro: 'Sem permissão.' }, 403)
      if (c.aceito_em) return json({ erro: 'Este convite já foi aceito.' }, 409)
      if (acao === 'revogar_convite') {
        await admin.from('portal_convites').update({ revogado_em: new Date().toISOString() }).eq('id', c.id)
        await auditar(c.tenant_id, user.id, 'convite_revogado', { client_id: c.client_id, email: mascarar(c.email) })
        return json({ ok: true })
      }
      const r = await darAcesso({ clientId: c.client_id, email: c.email, nome: c.nome, perfil: c.perfil, equipes: c.equipes ?? [], por: user.id })
      return 'erro' in r ? json({ erro: r.erro }, r.status) : json(r)
    }

    if (acao === 'decidir_solicitacao') {
      const { data: s } = await admin.from('portal_solicitacoes_acesso').select('*').eq('id', b.id).maybeSingle()
      if (!s || s.situacao !== 'pendente') return json({ erro: 'Pedido não encontrado ou já decidido.' }, 404)
      const clientId: string | null = s.client_id ?? (b.client_id ?? null)
      // a empresa (interna) pode vincular qualquer cliente; o Supervisor só decide pedidos do próprio cliente
      let permitido = false
      if (clientId) {
        const papel = await papelNo(clientId)
        permitido = papel === 'interno' || (papel === 'supervisor' && s.client_id === clientId)
      } else {
        const { data: eu } = await admin.from('users').select('role, tenant_id').eq('id', user.id).eq('active', true).maybeSingle()
        permitido = !!eu && ['admin', 'gestor'].includes(eu.role) && eu.tenant_id === s.tenant_id   // pedido sem cliente: só a empresa (e, para aprovar, ela escolhe o cliente)
      }
      if (!permitido) return json({ erro: 'Sem permissão.' }, 403)
      const { empresa, portalNome } = await dadosPortal(s.tenant_id)
      if (b.aprovar) {
        if (!clientId) return json({ erro: 'Escolha o cliente da pessoa para aprovar.' }, 400)
        const r = await darAcesso({ clientId, email: s.email, nome: s.nome, perfil: b.perfil === 'supervisor' ? 'supervisor' : 'usuario', equipes: [], por: user.id, celular: s.celular })
        if ('erro' in r) return json({ erro: r.erro }, r.status)
        await admin.from('portal_solicitacoes_acesso').update({ situacao: 'aprovada', client_id: clientId, decidido_por: user.id, decidido_em: new Date().toISOString() }).eq('id', s.id)
        await auditar(s.tenant_id, user.id, 'solicitacao_aprovada', { email: mascarar(s.email), client_id: clientId })
        return json({ ok: true, email_enviado: r.email_enviado })
      }
      const motivo = String(b.motivo ?? '').trim().slice(0, 300) || null
      await admin.from('portal_solicitacoes_acesso').update({ situacao: 'recusada', decidido_por: user.id, decidido_em: new Date().toISOString(), motivo_recusa: motivo }).eq('id', s.id)
      await enviarEmail(s.tenant_id, s.email, `Seu pedido de acesso ao portal ${portalNome}`,
        `Olá, ${s.nome}. Não foi possível liberar o seu acesso ao portal da ${empresa} neste momento.${motivo ? ' Motivo: ' + motivo : ''} Fale com a ${empresa} para mais informações.`,
        moldura('Pedido de acesso', `<p>Olá, <b>${esc(s.nome)}</b>.</p><p>Não foi possível liberar o seu acesso ao portal da <b>${esc(empresa)}</b> neste momento.</p>${motivo ? `<p>Motivo: ${esc(motivo)}</p>` : ''}<p>Fale com a ${esc(empresa)} para mais informações.</p>`))
      await auditar(s.tenant_id, user.id, 'solicitacao_recusada', { email: mascarar(s.email) })
      return json({ ok: true })
    }

    if (acao === 'anonimizar') {
      const { data: eu } = await admin.from('users').select('role, tenant_id').eq('id', user.id).eq('active', true).maybeSingle()
      if (!eu || eu.role !== 'admin' || !eu.tenant_id) return json({ erro: 'Só o administrador da empresa anonimiza dados de pessoas do portal.' }, 403)
      const uid = String(b.user_id ?? '')
      const { data: vs } = await admin.from('portal_vinculos').select('id, tenant_id, ativo').eq('user_id', uid)
      if (!vs?.some((v: any) => v.tenant_id === eu.tenant_id)) return json({ erro: 'Pessoa não encontrada nesta empresa.' }, 404)
      // sai deste portal: acessos desativados e equipes esvaziadas
      await admin.from('portal_vinculos').update({ ativo: false, desativado_em: new Date().toISOString(), desativado_por: user.id }).eq('user_id', uid).eq('tenant_id', eu.tenant_id)
      await admin.from('portal_equipe_membros').delete().eq('user_id', uid).eq('tenant_id', eu.tenant_id)
      const emOutros = vs.some((v: any) => v.tenant_id !== eu.tenant_id)
      let anonimizada = false
      if (!emOutros) {
        // sem vínculo em nenhum outro portal: dados pessoais apagados e login bloqueado
        const anon = `removido-${uid.slice(0, 8)}@anonimizado.invalid`
        const { data: p } = await admin.from('portal_pessoas').select('email').eq('user_id', uid).maybeSingle()
        await admin.from('portal_pessoas').update({ nome: 'Usuário removido', email: anon, celular: null }).eq('user_id', uid)
        await admin.auth.admin.updateUserById(uid, { email: anon, password: senhaAleatoria(), ban_duration: '876000h', user_metadata: { name: 'Usuário removido' } })
        if (p?.email) await admin.from('portal_convites').delete().eq('email', p.email)
        if (p?.email) await admin.from('portal_solicitacoes_acesso').update({ nome: 'Usuário removido', email: anon, celular: null, mensagem: null }).eq('email', p.email)
        anonimizada = true
      }
      await auditar(eu.tenant_id, user.id, anonimizada ? 'pessoa_anonimizada' : 'pessoa_removida_do_portal', { user_id: uid })
      return json({ ok: true, anonimizada, mantida_em_outros_portais: emOutros })
    }

    return json({ erro: 'Ação inválida.' }, 400)
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : 'Erro inesperado.' }, 500)
  }
})
