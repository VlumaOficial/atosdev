// Avisos por e-mail dos chamados do portal (E4 do portal).
//
// Chamada pelo banco (gatilho em orders, via pg_net, com a chave de serviço) quando
// um chamado do portal é ABERTO ou muda de situação: agendada, em atendimento,
// resolvido, cancelado.
//
// Regras:
//   * só envia a quem aceitou o consentimento de comunicação (LGPD) e não o retirou
//   * respeita o canal: a empresa precisa ter o e-mail liberado e a pessoa não pode
//     tê-lo desligado nas preferências
//   * um aviso por chamado e evento (tabela portal_avisos); remarcar o agendamento
//     gera um aviso novo (a data entra na chave)
//   * remetente da empresa (e-mail próprio, se configurado, ou "<Empresa> via ATOS")
//   * nunca envia para domínios de teste (example.com, .test, .invalid…): grava o
//     texto e o link em portal_avisos.detalhe para conferência
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
const SITE = Deno.env.get('SITE_URL') ?? 'https://atosdev.vluma.com.br'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const RESERVADO = (e: string) => /@([a-z0-9-]+\.)*(example\.(com|org|net)|test|invalid|example|localhost)$/i.test(e)

function criarCliente(host: string, usuario: string, senha: string) {
  const t = nodemailer.createTransport({ host, port: 465, secure: true, auth: { user: usuario, pass: senha }, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000 })
  return { send: (m: { from: string; to: string; replyTo?: string; subject: string; text: string; html: string }) => t.sendMail(m), close: () => t.close() }
}

function moldura(titulo: string, corpoHtml: string, botao: { texto: string; link: string }, rodape: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
  <h2 style="font-size:18px;margin:0 0 16px">${esc(titulo)}</h2>${corpoHtml}
  <p style="margin:24px 0"><a href="${esc(botao.link)}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:bold">${esc(botao.texto)}</a></p>
  <p style="font-size:12px;color:#6b7280">${rodape}</p>
  <p style="font-size:11px;color:#9ca3af;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">Tecnologia ATOS · VLUMA</p></div>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { order_id, evento } = await req.json()
    if (!order_id || !['aberto', 'agendada', 'em_atendimento', 'resolvido', 'cancelado'].includes(evento)) return json({ erro: 'Parâmetros inválidos.' }, 400)
    const { data: o } = await admin.from('orders').select('id, tenant_id, client_id, number, title, status, solicitante_id, scheduled_at, location_id').eq('id', order_id).maybeSingle()
    if (!o?.solicitante_id) return json({ ok: false, motivo: 'sem_solicitante' })
    const [{ data: t }, { data: pessoa }, { data: cli }, { data: pref }, { data: cfgEnvio }] = await Promise.all([
      admin.from('tenants').select('name, trade_name, email, envio_nivel, portal_nome, portal_slug, portal_abertura, fuso_horario').eq('id', o.tenant_id).single(),
      admin.from('portal_pessoas').select('nome, email').eq('user_id', o.solicitante_id).maybeSingle(),
      admin.from('clients').select('name').eq('id', o.client_id).single(),
      admin.from('portal_preferencias').select('canal_email').eq('user_id', o.solicitante_id).eq('tenant_id', o.tenant_id).maybeSingle(),
      admin.from('tenant_envio_config').select('*').eq('tenant_id', o.tenant_id).maybeSingle(),
    ])
    if (!pessoa?.email || pessoa.email.endsWith('@anonimizado.invalid')) return json({ ok: false, motivo: 'sem_destinatario' })

    // chave do aviso: remarcar a data gera aviso novo
    const chave = evento === 'agendada' ? `agendada:${o.scheduled_at ?? ''}` : evento
    const registrar = async (enviado: boolean, motivo?: string, detalhe?: string) => {
      await admin.from('portal_avisos').upsert({ tenant_id: o.tenant_id, order_id: o.id, evento: chave, enviado, motivo: motivo ?? null, detalhe: detalhe ?? null }, { onConflict: 'order_id,evento', ignoreDuplicates: false })
    }
    const { data: jaFoi } = await admin.from('portal_avisos').select('id, enviado').eq('order_id', o.id).eq('evento', chave).maybeSingle()
    if (jaFoi?.enviado) return json({ ok: true, ja_enviado: true })

    // consentimento (LGPD) e canal
    const { data: aceite } = await admin.from('termos_aceites').select('id, termos!inner(tipo)').eq('user_id', o.solicitante_id).eq('tenant_id', o.tenant_id).eq('termos.tipo', 'comunicacao').is('revogado_em', null).limit(1)
    if (!aceite?.length) { await registrar(false, 'sem_consentimento'); return json({ ok: false, motivo: 'sem_consentimento' }) }
    if ((t?.portal_abertura as any)?.canais?.email === false) { await registrar(false, 'canal_nao_liberado'); return json({ ok: false, motivo: 'canal_nao_liberado' }) }
    if (pref && pref.canal_email === false) { await registrar(false, 'canal_desligado'); return json({ ok: false, motivo: 'canal_desligado' }) }

    const empresa = ((t?.trade_name || t?.name || 'Empresa') as string).replace(/[<>"]/g, '').replace(/\.$/, '')
    const portalNome = (t?.portal_nome as string | null) || `Central de Atendimento ${empresa}`
    const { data: end } = await admin.from('portal_enderecos').select('host').eq('tenant_id', o.tenant_id).eq('situacao', 'ativo').eq('principal', true).limit(1).maybeSingle()
    const base = end?.host ? `https://${end.host}` : `${SITE}/portal/${t?.portal_slug}`
    const link = `${base}/chamados/${o.id}`
    const quando = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: t?.fuso_horario || 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às') : ''
    const primeiro = (pessoa.nome || '').split(' ')[0]
    const T: Record<string, { assunto: string; titulo: string; texto: string }> = {
      aberto: { assunto: `Recebemos o seu chamado ${o.number}`, titulo: 'Chamado recebido', texto: `Registramos o seu chamado "${o.title}" (${o.number}). A ${empresa} vai analisá-lo e você acompanha tudo pelo portal.` },
      agendada: { assunto: `Seu chamado ${o.number} foi agendado`, titulo: 'Chamado agendado', texto: `O atendimento do chamado "${o.title}" (${o.number}) foi agendado para ${quando(o.scheduled_at)}.` },
      em_atendimento: { assunto: `Seu chamado ${o.number} está em atendimento`, titulo: 'Chamado em atendimento', texto: `O atendimento do chamado "${o.title}" (${o.number}) foi iniciado.` },
      resolvido: { assunto: `Seu chamado ${o.number} foi resolvido`, titulo: 'Chamado resolvido', texto: `O chamado "${o.title}" (${o.number}) foi concluído pela ${empresa}. Se o problema continuar, fale com a ${empresa} pelos contatos do portal.` },
      cancelado: { assunto: `Seu chamado ${o.number} foi cancelado`, titulo: 'Chamado cancelado', texto: `O chamado "${o.title}" (${o.number}) foi cancelado. Em caso de dúvida, fale com a ${empresa} pelos contatos do portal.` },
    }
    const m = T[evento]
    const texto = `Olá, ${primeiro}!\n\n${m.texto}\n\nAcompanhe: ${link}\n\nVocê recebe este aviso porque aceitou receber comunicações da ${empresa}. Para parar, ajuste as preferências no portal: ${base}/preferencias`
    const html = moldura(m.titulo, `<p>Olá, <b>${esc(primeiro)}</b>!</p><p>${esc(m.texto)}</p><p style="font-size:13px;color:#6b7280">Cliente: ${esc(cli?.name ?? '')}</p>`,
      { texto: 'Acompanhar o chamado', link }, `Você recebe este aviso porque aceitou receber comunicações da ${esc(empresa)}. Para parar, <a href="${esc(base)}/preferencias">ajuste as preferências no portal</a>.`)

    if (RESERVADO(pessoa.email)) { await registrar(false, 'dominio_reservado', `${m.assunto} | ${link}`); return json({ ok: false, motivo: 'dominio_reservado' }) }
    try {
      let smtp: ReturnType<typeof criarCliente>, from: string, replyTo: string | undefined
      if (cfgEnvio?.smtp_ativo && t?.envio_nivel !== 'basico') {
        const { data: senha } = await admin.rpc('ler_senha_smtp', { p_tenant: o.tenant_id })
        if (!senha || !cfgEnvio.smtp_host || !cfgEnvio.smtp_usuario) throw new Error('e-mail próprio incompleto')
        smtp = criarCliente(cfgEnvio.smtp_host, cfgEnvio.smtp_usuario, senha as string)
        from = `${cfgEnvio.smtp_remetente_nome || empresa} <${cfgEnvio.smtp_email_remetente || cfgEnvio.smtp_usuario}>`
      } else {
        smtp = criarCliente(Deno.env.get('SMTP_PADRAO_HOST') ?? 'smtp.zoho.com', Deno.env.get('SMTP_PADRAO_USUARIO') ?? '', Deno.env.get('SMTP_PADRAO_SENHA') ?? '')
        from = `${empresa} via ATOS <${Deno.env.get('SMTP_PADRAO_USUARIO')}>`
        replyTo = t?.email || undefined
      }
      await smtp.send({ from, to: pessoa.email, replyTo, subject: m.assunto, text: texto, html })
      smtp.close()
      await registrar(true)
      return json({ ok: true })
    } catch (e) {
      await registrar(false, 'falha_no_envio', (e as Error).message?.slice(0, 200))
      return json({ ok: false, motivo: 'falha_no_envio' })
    }
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : 'Erro inesperado.' }, 500)
  }
})
