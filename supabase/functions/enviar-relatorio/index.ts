import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'

// Cliente SMTP (nodemailer). A primeira versão usava denomailer, que no
// runtime atual do Supabase estourava o limite de processamento
// (WORKER_RESOURCE_LIMIT) até em e-mail simples — trocado em 2026-09-24.
function criarCliente(host: string, usuario: string, senha: string) {
  const t = nodemailer.createTransport({ host, port: 465, secure: true, auth: { user: usuario, pass: senha }, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000 })
  return {
    send: (m: { from: string; to: string; replyTo?: string; subject: string; content: string; html: string; attachments?: { filename: string; content: Uint8Array; contentType: string }[] }) =>
      t.sendMail({ from: m.from, to: m.to, replyTo: m.replyTo, subject: m.subject, text: m.content, html: m.html, attachments: m.attachments }),
    close: async () => { t.close() },
  }
}

// Envio do relatório da OS por E-MAIL (Blocos D + E, 2026-09-24).
// (WhatsApp do nível Básico é pelo aparelho — não passa por aqui.)
//  - confere no SERVIDOR: mesma empresa, OS concluída com relatório,
//    canal ligado e quem pode enviar (técnico: conforme a config;
//    admin/gestor: sempre)
//  - remetente: e-mail próprio da empresa (nível Intermediário+, senha no
//    Vault) ou o padrão "<Empresa> via ATOS" <noreply@vluma.com.br>, com
//    "Responder para" = e-mail de contato da empresa
//  - PDF anexado + link de verificação; registro na linha do tempo com
//    destino MASCARADO (LGPD)
// Supabase só permite SMTP na porta 465 (SSL).
// POST { order_id, destino, mensagem? }        → envia
// POST { teste_smtp: true, destino }           → testa o e-mail próprio (admin)

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const SITE = Deno.env.get('SITE_URL') ?? 'https://atosdev.vercel.app'
const EMAIL_OK = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)
const mascararEmail = (e: string) => { const [u, d] = e.split('@'); return `${u.charAt(0)}***@${d}` }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const caller = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ erro: 'Não autenticado' }, 401)
  const { data: eu } = await admin.from('users').select('id, name, role, tenant_id').eq('id', user.id).single()
  if (!eu?.tenant_id) return json({ erro: 'Usuário sem empresa' }, 403)

  const corpo = await req.json().catch(() => ({}))
  const destino = String(corpo?.destino ?? '').trim()
  if (!EMAIL_OK(destino)) return json({ erro: 'E-mail de destino inválido.' }, 400)

  const [{ data: tenant }, { data: cfg }] = await Promise.all([
    admin.from('tenants').select('name, trade_name, email, envio_nivel').eq('id', eu.tenant_id).single(),
    admin.from('tenant_envio_config').select('*').eq('tenant_id', eu.tenant_id).single(),
  ])
  const empresa = (tenant?.trade_name || tenant?.name || 'Empresa') as string
  const usarProprio = !!cfg?.smtp_ativo && tenant?.envio_nivel !== 'basico'

  async function smtpDaEmpresa() {
    const { data: senha } = await admin.rpc('ler_senha_smtp', { p_tenant: eu!.tenant_id })
    if (!senha || !cfg?.smtp_host || !cfg?.smtp_usuario) throw new Error('E-mail próprio incompleto (servidor, usuário ou senha).')
    return {
      client: criarCliente(cfg.smtp_host, cfg.smtp_usuario, senha as string),
      from: `${cfg.smtp_remetente_nome || empresa} <${cfg.smtp_email_remetente || cfg.smtp_usuario}>`,
      replyTo: undefined as string | undefined,
    }
  }
  function smtpPadrao() {
    return {
      client: criarCliente(Deno.env.get('SMTP_PADRAO_HOST') ?? 'smtp.zoho.com', Deno.env.get('SMTP_PADRAO_USUARIO') ?? '', Deno.env.get('SMTP_PADRAO_SENHA') ?? ''),
      from: `${empresa.replace(/[<>"]/g, '')} via ATOS <${Deno.env.get('SMTP_PADRAO_USUARIO')}>`,
      replyTo: tenant?.email || undefined,
    }
  }

  // ---- teste do e-mail próprio (tela de Configurações)
  if (corpo?.teste_smtp) {
    if (!['admin', 'super_admin'].includes(eu.role)) return json({ erro: 'Sem permissão' }, 403)
    try {
      const s = await smtpDaEmpresa()
      await s.client.send({ from: s.from, to: destino, subject: `Teste de envio — ${empresa} (ATOS)`, content: 'E-mail de teste do ATOS: o e-mail próprio da empresa está configurado corretamente.', html: `<p>E-mail de teste do <b>ATOS</b>: o e-mail próprio da <b>${esc(empresa)}</b> está configurado corretamente.</p>` })
      await s.client.close()
      return json({ ok: true })
    } catch (e) {
      return json({ ok: false, erro: 'Falha no e-mail próprio: ' + String((e as Error)?.message ?? e).slice(0, 200) })
    }
  }

  // ---- diagnóstico (admin): e-mail simples pelo remetente padrão, sem anexo
  if (corpo?.diag && ['admin', 'super_admin'].includes(eu.role)) {
    const t0 = Date.now()
    try {
      const s0 = smtpPadrao()
      await s0.client.send({ from: s0.from, to: destino, subject: 'ATOS - diagnostico de envio', content: 'Teste simples do ATOS.', html: '<p>Teste simples do ATOS.</p>' })
      await s0.client.close()
      return json({ ok: true, ms: Date.now() - t0 })
    } catch (e) { return json({ ok: false, ms: Date.now() - t0, erro: String((e as Error)?.message ?? e).slice(0, 300) }) }
  }

  // ---- envio do relatório
  const orderId = corpo?.order_id
  const { data: os } = await admin.from('orders').select('id, number, tenant_id, status, clients(name)').eq('id', orderId).single()
  if (!os || os.tenant_id !== eu.tenant_id) return json({ erro: 'OS não encontrada' }, 404)
  if (os.status !== 'concluida') return json({ erro: 'Só é possível enviar o relatório de OS concluída.' }, 409)
  if (!cfg?.email_ativo) return json({ erro: 'O envio por e-mail está desligado nas configurações da empresa.' }, 403)
  if (eu.role === 'tecnico') {
    const ok = cfg.permissao === 'todos' || (cfg.permissao === 'selecionados' && (cfg.tecnicos_permitidos ?? []).includes(eu.id))
    if (!ok) return json({ erro: 'Você não tem permissão para enviar relatórios. Fale com o gestor.' }, 403)
  }
  const { data: rel } = await admin.from('order_reports').select('file_path, codigo, versao').eq('order_id', orderId)
    .eq('status', 'gerado').is('removido_em', null).order('versao', { ascending: false }).limit(1).maybeSingle()
  if (!rel?.file_path) return json({ erro: 'O relatório PDF ainda não está disponível.' }, 409)

  const link = `${SITE}/verificar/${rel.codigo}`
  const cliente = (os as any).clients?.name ?? ''
  const texto = String(corpo?.mensagem || cfg.mensagem)
    .replaceAll('{os}', os.number).replaceAll('{empresa}', empresa).replaceAll('{cliente}', cliente).replaceAll('{link}', link)

  const { data: pdf } = await admin.storage.from('evidencias').download(rel.file_path)
  if (!pdf) return json({ erro: 'Não foi possível ler o PDF do relatório.' }, 500)
  const bytes = new Uint8Array(await pdf.arrayBuffer())

  let s
  try { s = usarProprio ? await smtpDaEmpresa() : smtpPadrao() } catch (e) { return json({ erro: String((e as Error).message) }, 400) }
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1f29;max-width:560px">
    <p style="font-size:16px;font-weight:bold;margin:0 0 12px">${esc(empresa)} — Relatório de atendimento ${esc(os.number)}</p>
    <p style="white-space:pre-wrap;margin:0 0 16px">${esc(texto)}</p>
    <p><a href="${link}" style="display:inline-block;background:#8b5cf6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Abrir o relatório e conferir a autenticidade</a></p>
    <p style="font-size:12px;color:#6b7280;margin-top:20px">O relatório em PDF também está anexado. Enviado pelo ATOS — Gestão de Campo.</p></div>`
  try {
    await s.client.send({
      from: s.from, to: destino, ...(s.replyTo ? { replyTo: s.replyTo } : {}),
      subject: `Relatório de atendimento ${os.number} — ${empresa}`,
      content: texto, html,
      attachments: [{ filename: `Relatorio_${os.number}${rel.versao > 1 ? '_v' + rel.versao : ''}.pdf`, content: bytes, contentType: 'application/pdf' }],
    })
    await s.client.close()
  } catch (e) {
    return json({ erro: 'Falha ao enviar o e-mail: ' + String((e as Error)?.message ?? e).slice(0, 200) }, 502)
  }

  await admin.from('order_events').insert({
    tenant_id: eu.tenant_id, order_id: orderId, event_type: 'report_sent', actor_id: eu.id, actor_name: eu.name,
    details: { canal: 'email', destino: mascararEmail(destino), remetente: usarProprio ? 'proprio' : 'atos' },
  })
  return json({ ok: true, remetente: usarProprio ? 'proprio' : 'atos' })
})
