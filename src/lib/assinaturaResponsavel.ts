import { supabase } from '@/lib/supabase'

// Assinatura do RESPONSÁVEL (quem conclui a OS — técnico ou admin).
// Decisão 2026-09-24: desenhada UMA vez no perfil e aplicada
// automaticamente na conclusão. Na OS vai uma CÓPIA
// ({tenant}/assinaturas/{os}_responsavel.png): trocar a assinatura do
// perfil depois não altera OS já concluídas. O login + hora do servidor
// identificam quem concluiu; o desenho é a representação visual (PDF).

const BUCKET = 'evidencias'

async function eu(): Promise<{ id: string; nome: string; tenantId: string } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('name, tenant_id').eq('id', user.id).single()
  if (!data?.tenant_id) return null
  return { id: user.id, nome: data.name, tenantId: data.tenant_id }
}

const caminhoPerfil = (tenantId: string, userId: string) => `${tenantId}/assinaturas/tecnicos/${userId}.png`

// URL da minha assinatura de perfil, ou null se ainda não cadastrei
// (createSignedUrls em lote: "não existe" sem erro 400 no console)
export async function urlMinhaAssinatura(): Promise<string | null> {
  const u = await eu()
  if (!u) return null
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls([caminhoPerfil(u.tenantId, u.id)], 600)
  const r = data?.[0]
  return r && !r.error && r.signedUrl ? r.signedUrl : null
}

export async function salvarMinhaAssinatura(dataUrl: string): Promise<{ erro?: string }> {
  const u = await eu()
  if (!u) return { erro: 'Sessão expirada. Faça login novamente.' }
  const blob = await (await fetch(dataUrl)).blob()
  const { error } = await supabase.storage.from(BUCKET)
    .upload(caminhoPerfil(u.tenantId, u.id), blob, { contentType: 'image/png', upsert: true })
  return error ? { erro: error.message } : {}
}

// Copia a assinatura do perfil para a OS e grava quem/quando
export async function aplicarAssinaturaResponsavel(orderId: string): Promise<{ erro?: string }> {
  const u = await eu()
  if (!u) return { erro: 'Sessão expirada. Faça login novamente.' }
  const { data: blob, error: e1 } = await supabase.storage.from(BUCKET).download(caminhoPerfil(u.tenantId, u.id))
  if (e1 || !blob) return { erro: 'Cadastre sua assinatura antes de concluir.' }
  const destino = `${u.tenantId}/assinaturas/${orderId}_responsavel.png`
  const { error: e2 } = await supabase.storage.from(BUCKET).upload(destino, blob, { contentType: 'image/png', upsert: true })
  if (e2) return { erro: e2.message }
  const { error: e3 } = await supabase.from('orders').update({
    technician_signature_path: destino,
    technician_signer_name: u.nome,
    technician_signed_at: new Date().toISOString(),
  }).eq('id', orderId)
  return e3 ? { erro: e3.message } : {}
}
