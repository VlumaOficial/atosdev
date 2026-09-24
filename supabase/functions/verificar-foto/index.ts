import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Verificação PÚBLICA de autenticidade de foto de evidência (sem login).
// Publicada com verify_jwt = false. Usa a service role só no servidor e
// devolve o mínimo: empresa, nº da OS, horários, resultado da checagem e
// uma URL temporária (5 min) da foto guardada. Nenhum id interno, e-mail
// ou nome de técnico sai daqui (minimização — LGPD).
//
// Integridade: recalcula o SHA-256 do arquivo que está no bucket e
// compara com o registrado no envio (migration 026). Qualquer troca do
// arquivo depois do envio aparece como "alterada".

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    let bruto = url.searchParams.get('codigo') ?? ''
    if (!bruto && req.method === 'POST') bruto = (await req.json().catch(() => ({})))?.codigo ?? ''
    const codigo = String(bruto).toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!/^[A-HJKMNP-Z2-9]{12}$/.test(codigo)) return json({ encontrado: false, motivo: 'formato' })

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    const { data: reg } = await admin
      .from('fotos_verificacao')
      .select('codigo, tipo, file_path, sha256, bytes, carimbado_em, enviado_em, tenants(name), orders(number)')
      .eq('codigo', codigo)
      .maybeSingle()
    if (!reg) return json({ encontrado: false, motivo: 'nao_encontrado' })

    const { data: arquivo } = await admin.storage.from('evidencias').download(reg.file_path)
    let integra: boolean | null = null
    let urlFoto: string | null = null
    if (arquivo) {
      integra = (await sha256Hex(await arquivo.arrayBuffer())) === reg.sha256
      const { data: assinada } = await admin.storage.from('evidencias').createSignedUrl(reg.file_path, 300)
      urlFoto = assinada?.signedUrl ?? null
    }

    const divergenciaMin = reg.carimbado_em
      ? Math.round((new Date(reg.enviado_em).getTime() - new Date(reg.carimbado_em).getTime()) / 60000)
      : null

    return json({
      encontrado: true,
      codigo: reg.codigo,
      tipo: (reg as any).tipo ?? 'foto',
      empresa: (reg as any).tenants?.name ?? null,
      os: (reg as any).orders?.number ?? null,
      carimbado_em: reg.carimbado_em,
      enviado_em: reg.enviado_em,
      divergencia_relogio_min: divergenciaMin,
      arquivo_disponivel: !!arquivo,
      integra,
      sha256: reg.sha256,
      url_foto: urlFoto,
    })
  } catch (_e) {
    return json({ encontrado: false, motivo: 'erro' }, 500)
  }
})
