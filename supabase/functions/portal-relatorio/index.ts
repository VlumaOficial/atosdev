// Relatório (PDF) do chamado resolvido, para o cliente do portal (E5c).
// O banco decide quem pode (portal_relatorio_chamado: só quem enxerga o chamado, só resolvido); esta função
// apenas troca o caminho do arquivo por uma URL assinada de curta duração. Nunca devolve o caminho em si.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return json({ erro: 'Entre no portal para baixar o relatório.' }, 401)
    const { order_id } = await req.json()
    if (!order_id) return json({ erro: 'Informe o chamado.' }, 400)
    // 1) o banco confere o acesso COM o login da pessoa
    const eu = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } })
    const { data: caminho, error } = await eu.rpc('portal_relatorio_chamado', { p_order: order_id })
    if (error || !caminho) return json({ erro: 'O relatório deste chamado não está disponível.' }, 404)
    // 2) só então a chave de serviço assina o arquivo (5 minutos)
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: url, error: e2 } = await admin.storage.from('evidencias').createSignedUrl(caminho as string, 300)
    if (e2 || !url?.signedUrl) return json({ erro: 'Não foi possível preparar o relatório.' }, 500)
    return json({ url: url.signedUrl })
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : 'Erro inesperado.' }, 500)
  }
})
