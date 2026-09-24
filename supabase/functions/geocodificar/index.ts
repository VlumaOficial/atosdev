import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Coordenada → endereço para o carimbo das fotos (serviço da plataforma).
// Decisões 2026-09-24: provedor trocável pelo Super Admin sem deploy
// (tabela geocodificacao_config); mesmo provedor em DEV e PRD; consumo
// medido por empresa (geocodificacao_uso); chave do provedor só aqui no
// servidor. Cache compartilhado por região (~55 m) respeitando o prazo do
// provedor (LocationIQ gratuito: 48 h).
//
// Endereço no formato brasileiro, só com o que o OpenStreetMap acerta:
// "Rua - Bairro, Cidade - UF, CEP" (sem número e sem nome do local —
// testado: vinha o vizinho e o número errado).
//
// POST { lat, lng }                       → { endereco, fonte }
// POST { testar: { provedor, chave? } }   → (só Super Admin) testa sem salvar

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const TIMEOUT_MS = 5000
const COORD_TESTE = { lat: -12.963623, lng: -38.471754 } // Salvador — endereço conhecido

type Provedor = 'nominatim' | 'locationiq' | 'opencage'

// alguns provedores (ex.: LocationIQ) devolvem o nome do estado, não a sigla
const UF: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceará': 'CE',
  'distrito federal': 'DF', 'espírito santo': 'ES', 'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT',
  'mato grosso do sul': 'MS', 'minas gerais': 'MG', 'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR',
  'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
  'rio grande do sul': 'RS', 'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
  'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
}
const siglaUF = (estado?: string) => estado ? (UF[estado.trim().toLowerCase()] ?? estado) : undefined

function formatarOSM(a: Record<string, string>): string | null {
  const rua = a.road ?? a.pedestrian ?? a.footway
  const bairro = a.suburb ?? a.neighbourhood ?? a.quarter
  const cidade = a.city ?? a.town ?? a.village ?? a.municipality
  const uf = (a['ISO3166-2-lvl4'] ?? '').replace(/^BR-/, '') || a.state_code || siglaUF(a.state)
  const cep = a.postcode
  const p1 = [rua, bairro].filter(Boolean).join(' - ')
  const p2 = [cidade, uf].filter(Boolean).join(' - ')
  const texto = [p1, p2].filter(Boolean).join(', ') + (cep ? `, ${cep}` : '')
  return texto.trim() || null
}

async function consultar(provedor: Provedor, chave: string | null, lat: number, lng: number): Promise<string | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    if (provedor === 'nominatim') {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lng}`,
        { signal: ctl.signal, headers: { 'User-Agent': 'ATOS-VLUMA/1.0 (atos@vluma.com.br)', 'Referer': 'https://atosdev.vercel.app/' } })
      if (!r.ok) throw new Error('nominatim ' + r.status)
      const j = await r.json()
      return j?.address ? formatarOSM(j.address) : null
    }
    if (provedor === 'locationiq') {
      const r = await fetch(`https://us1.locationiq.com/v1/reverse?key=${encodeURIComponent(chave ?? '')}&lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=pt-BR`, { signal: ctl.signal })
      if (!r.ok) throw new Error('locationiq ' + r.status)
      const j = await r.json()
      return j?.address ? formatarOSM(j.address) : null
    }
    const r = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${encodeURIComponent(chave ?? '')}&language=pt-BR&no_annotations=1&limit=1`, { signal: ctl.signal })
    if (!r.ok) throw new Error('opencage ' + r.status)
    const j = await r.json()
    const c = j?.results?.[0]?.components
    return c ? formatarOSM(c) : null
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // quem está chamando (JWT validado pela plataforma: verify_jwt = true)
  const caller = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ endereco: null, fonte: 'nao_autenticado' }, 401)
  const { data: perfil } = await admin.from('users').select('tenant_id, role').eq('id', user.id).single()

  const corpo = await req.json().catch(() => ({}))

  // teste de provedor (tela do Super Admin) — não salva nada
  if (corpo?.testar) {
    if (perfil?.role !== 'super_admin') return json({ erro: 'Sem permissão' }, 403)
    const prov = corpo.testar.provedor as Provedor
    let chave: string | null = corpo.testar.chave ?? null
    if (!chave && prov !== 'nominatim') {
      const { data: cfg } = await admin.from('geocodificacao_config').select('provedor, chave').eq('id', true).single()
      if (cfg?.provedor === prov) chave = cfg.chave
    }
    const inicio = Date.now()
    try {
      const endereco = await consultar(prov, chave, COORD_TESTE.lat, COORD_TESTE.lng)
      return json({ ok: !!endereco, endereco, ms: Date.now() - inicio })
    } catch (e) {
      return json({ ok: false, erro: String((e as Error).message ?? e), ms: Date.now() - inicio })
    }
  }

  const lat = Number(corpo?.lat), lng = Number(corpo?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ endereco: null, fonte: 'coordenada_invalida' }, 400)
  }
  const tenant = perfil?.tenant_id as string | null

  const { data: cfg } = await admin.from('geocodificacao_config').select('provedor, chave, cache_horas').eq('id', true).single()
  const provedor = (cfg?.provedor ?? 'nominatim') as Provedor
  const registrar = (tipo: string) => tenant
    ? admin.rpc('registrar_uso_geocodificacao', { p_tenant: tenant, p_provedor: provedor, p_tipo: tipo })
    : Promise.resolve()

  // cache por região (~55 m): arredonda para múltiplos de 0,0005°
  const chaveCache = `${(Math.round(lat * 2000) / 2000).toFixed(4)},${(Math.round(lng * 2000) / 2000).toFixed(4)}`
  const horas = cfg?.cache_horas ?? 48
  if (horas > 0) {
    const { data: hit } = await admin.from('geocodificacao_cache').select('endereco, criado_em').eq('chave', chaveCache).maybeSingle()
    if (hit && hit.endereco && Date.now() - new Date(hit.criado_em).getTime() < horas * 3600_000) {
      await registrar('cache')
      return json({ endereco: hit.endereco, fonte: 'cache' })
    }
  }

  try {
    const endereco = await consultar(provedor, cfg?.chave ?? null, lat, lng)
    await registrar('consulta')
    if (endereco && horas > 0) {
      await admin.from('geocodificacao_cache').upsert({ chave: chaveCache, endereco, provedor, criado_em: new Date().toISOString() })
    }
    return json({ endereco, fonte: 'provedor' })
  } catch (e) {
    await registrar('falha')
    // motivo técnico (status HTTP do provedor/timeout) — sem dado sensível
    return json({ endereco: null, fonte: 'falha', motivo: String((e as Error)?.message ?? e).slice(0, 120) })   // nunca bloqueia a foto
  }
})
