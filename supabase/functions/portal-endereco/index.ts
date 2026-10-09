// Endereço automático do portal de atendimento (E1 do portal).
//
// Cria, para cada empresa com portal habilitado, o endereço
//   <prefixo>.<nome curto>.<domínio base>   (ex.: atendimento.infoxtec.vluma.com.br)
// 1. cadastra o domínio no projeto da Vercel (certificado automático)
// 2. cria o registro DNS na Cloudflare (CNAME, somente DNS) para o alvo da Vercel
// 3. acompanha a situação em portal_enderecos até ficar ativo
//
// Ações (POST JSON): sincronizar | verificar | remover
//   admin da empresa → age na própria empresa; Super Admin → informa tenant_id
//
// Segurança:
//   * só admin da empresa ou Super Admin; empresa com portal habilitado
//   * só mexe em nomes no formato <prefixo>.<slug>.<domínio base> — nunca em
//     outros registros da zona (e-mail, sites, etc.)
//   * nunca sobrescreve um registro DNS existente que aponte para outro lugar
//   * os tokens da Cloudflare e da Vercel só existem como segredos desta função
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const CF_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN') ?? ''
const CF_ZONE = Deno.env.get('CLOUDFLARE_ZONE_ID') ?? ''
const VC_TOKEN = Deno.env.get('VERCEL_TOKEN') ?? ''
const VC_PROJECT = Deno.env.get('VERCEL_PROJECT_ID') ?? ''
const VC_TEAM = Deno.env.get('VERCEL_TEAM_ID') ?? ''

async function api(url: string, token: string, init: RequestInit = {}) {
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  })
  let body: any = null
  try { body = await r.json() } catch { /* sem corpo */ }
  return { ok: r.ok, status: r.status, body }
}
const vc = (path: string, init?: RequestInit) =>
  api(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${VC_TEAM}`, VC_TOKEN, init)
const cf = (path: string, init?: RequestInit) =>
  api(`https://api.cloudflare.com/client/v4/zones/${CF_ZONE}${path}`, CF_TOKEN, init)

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Estado do endereço: Vercel (domínio verificado? DNS certo?) + prova real (HTTPS responde)
async function estadoDoHost(host: string) {
  const dom = await vc(`/v9/projects/${VC_PROJECT}/domains/${host}`)
  if (!dom.ok) return { situacao: 'erro', detalhe: { erro: 'Domínio não está no projeto da Vercel.', vercel_status: dom.status } }
  let verified = !!dom.body?.verified
  if (!verified) {
    const v = await vc(`/v9/projects/${VC_PROJECT}/domains/${host}/verify`, { method: 'POST' })
    verified = !!v.body?.verified
  }
  const cfg = await vc(`/v6/domains/${host}/config`)
  const misconfigured = cfg.body?.misconfigured !== false
  let probe = false
  try {
    const r = await fetch(`https://${host}/version.json`, { signal: AbortSignal.timeout(6000) })
    probe = r.ok
  } catch { /* certificado ainda sendo emitido ou DNS propagando */ }
  const situacao = probe ? 'ativo' : (verified && !misconfigured) ? 'verificando' : 'aguardando_dns'
  return { situacao, detalhe: { verified, misconfigured, https: probe, verificado_em: new Date().toISOString() } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!CF_TOKEN || !CF_ZONE || !VC_TOKEN || !VC_PROJECT || !VC_TEAM) {
      return json({ error: 'Integração de endereços não configurada no servidor.' }, 500)
    }
    const { acao, tenant_id, endereco_id } = await req.json()

    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user }, error: uerr } = await caller.auth.getUser()
    if (uerr || !user) return json({ error: 'Não autenticado.' }, 401)
    const { data: perfil } = await admin.from('users').select('role, tenant_id').eq('id', user.id).maybeSingle()
    if (!perfil) return json({ error: 'Sem permissão.' }, 403)

    let tenantId: string
    if (perfil.role === 'super_admin') {
      if (!tenant_id) return json({ error: 'Informe a empresa.' }, 400)
      tenantId = tenant_id
    } else if (perfil.role === 'admin' && perfil.tenant_id) {
      tenantId = perfil.tenant_id
    } else {
      return json({ error: 'Só o administrador da empresa pode gerenciar o endereço do portal.' }, 403)
    }

    const { data: t } = await admin.from('tenants').select('id, portal_habilitado, portal_slug').eq('id', tenantId).maybeSingle()
    if (!t?.portal_habilitado) return json({ error: 'O portal não está habilitado para esta empresa.' }, 400)
    const { data: plat } = await admin.from('portal_plataforma').select('dominio_base, prefixo').limit(1).maybeSingle()

    const auditar = (acaoAud: string, detalhe: Record<string, unknown>) =>
      admin.from('portal_auditoria').insert({ tenant_id: tenantId, user_id: user.id, acao: acaoAud, detalhe })

    const verificarTenant = async () => {
      const { data: linhas } = await admin.from('portal_enderecos').select('*')
        .eq('tenant_id', tenantId).eq('tipo', 'subdominio').neq('situacao', 'removido')
      for (const l of linhas ?? []) {
        if (l.situacao === 'ativo') continue
        const e = await estadoDoHost(l.host)
        await admin.from('portal_enderecos').update({
          situacao: e.situacao, detalhe: { ...(l.detalhe ?? {}), ...e.detalhe }, atualizado_em: new Date().toISOString(),
        }).eq('id', l.id)
        if (e.situacao === 'ativo') await auditar('endereco_ativo', { host: l.host })
      }
      const { data: depois } = await admin.from('portal_enderecos').select('id, host, tipo, situacao, principal, detalhe')
        .eq('tenant_id', tenantId).neq('situacao', 'removido').order('criado_em', { ascending: false })
      return depois ?? []
    }

    if (acao === 'verificar') {
      return json({ ok: true, enderecos: await verificarTenant() })
    }

    if (acao === 'sincronizar') {
      if (!plat?.dominio_base) return json({ ok: false, motivo: 'sem_dominio_base' })
      if (!t.portal_slug) return json({ ok: false, motivo: 'sem_slug' })
      const host = `${plat.prefixo}.${t.portal_slug}.${plat.dominio_base}`
      const valido = new RegExp(`^${esc(plat.prefixo)}\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?\\.${esc(plat.dominio_base)}$`)
      if (!valido.test(host)) return json({ error: 'Endereço fora do padrão permitido.' }, 400)

      const { data: existente } = await admin.from('portal_enderecos').select('id, tenant_id').eq('host', host).neq('situacao', 'removido').maybeSingle()
      if (existente && existente.tenant_id !== tenantId) return json({ ok: false, motivo: 'host_em_uso' })

      if (!existente) {
        // 1. Vercel: cadastra o domínio no projeto
        const add = await vc(`/v10/projects/${VC_PROJECT}/domains`, { method: 'POST', body: JSON.stringify({ name: host }) })
        if (!add.ok) {
          const ja = await vc(`/v9/projects/${VC_PROJECT}/domains/${host}`)
          if (!ja.ok) return json({ error: `A Vercel recusou o endereço: ${add.body?.error?.message ?? add.status}` }, 502)
        }
        // 2. alvo do DNS indicado pela Vercel para este domínio
        const cfg = await vc(`/v6/domains/${host}/config`)
        const alvo: string | undefined = cfg.body?.recommendedCNAME?.[0]?.value?.replace(/\.$/, '')
        if (!alvo) return json({ error: 'Não foi possível obter o alvo de DNS da Vercel.' }, 502)
        // 3. Cloudflare: CNAME somente DNS (nunca sobrescreve um registro diferente)
        const lista = await cf(`/dns_records?name=${encodeURIComponent(host)}`)
        if (!lista.ok) return json({ error: 'Não foi possível consultar o DNS na Cloudflare.' }, 502)
        const reg = lista.body?.result?.[0]
        if (reg) {
          if (!(reg.type === 'CNAME' && String(reg.content).replace(/\.$/, '') === alvo)) {
            return json({ error: 'Já existe um registro DNS diferente para este endereço. Fale com a VLUMA.' }, 409)
          }
        } else {
          const novo = await cf('/dns_records', {
            method: 'POST',
            body: JSON.stringify({ type: 'CNAME', name: host, content: alvo, proxied: false, ttl: 1, comment: `ATOS portal ${tenantId}` }),
          })
          if (!novo.ok) return json({ error: `A Cloudflare recusou o registro: ${novo.body?.errors?.[0]?.message ?? novo.status}` }, 502)
        }
        // 4. registra (o endereço novo vira o principal; os antigos continuam servindo)
        await admin.from('portal_enderecos').update({ principal: false }).eq('tenant_id', tenantId).eq('principal', true)
        await admin.from('portal_enderecos').insert({
          tenant_id: tenantId, host, tipo: 'subdominio', situacao: 'aguardando_dns', principal: true, detalhe: { cname: alvo },
        })
        await auditar('endereco_criado', { host })
      }
      return json({ ok: true, enderecos: await verificarTenant() })
    }

    if (acao === 'remover') {
      const { data: l } = await admin.from('portal_enderecos').select('*').eq('id', endereco_id).eq('tenant_id', tenantId).maybeSingle()
      if (!l || l.tipo !== 'subdominio') return json({ error: 'Endereço não encontrado.' }, 404)
      if (!plat?.dominio_base || !new RegExp(`^${esc(plat.prefixo)}\\.[a-z0-9-]+\\.${esc(plat.dominio_base)}$`).test(l.host)) {
        return json({ error: 'Endereço fora do padrão permitido.' }, 400)
      }
      await vc(`/v9/projects/${VC_PROJECT}/domains/${l.host}`, { method: 'DELETE' })
      const lista = await cf(`/dns_records?name=${encodeURIComponent(l.host)}`)
      for (const r of lista.body?.result ?? []) {
        if (r.type === 'CNAME' && String(r.comment ?? '').startsWith('ATOS portal')) await cf(`/dns_records/${r.id}`, { method: 'DELETE' })
      }
      await admin.from('portal_enderecos').update({ situacao: 'removido', principal: false, atualizado_em: new Date().toISOString() }).eq('id', l.id)
      await auditar('endereco_removido', { host: l.host })
      return json({ ok: true, enderecos: await verificarTenant() })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado.' }, 500)
  }
})
