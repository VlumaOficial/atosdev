import { supabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/orderEvents'

export interface UploadSignatureResult {
  path?: string
  erro?: string
}

// Envia a assinatura (PNG do canvas) pro bucket evidencias, grava na OS
// e registra o evento na linha do tempo. Path: {tenant}/assinaturas/{orderId}.png
export async function uploadAssinatura(
  dataUrl: string,
  orderId: string,
  signerName: string
): Promise<UploadSignatureResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Sessão expirada. Faça login novamente.' }

  const { data: perfil } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  const tenantId = perfil?.tenant_id
  if (!tenantId) return { erro: 'Usuário sem empresa vinculada.' }

  const blob = await (await fetch(dataUrl)).blob()
  const caminho = `${tenantId}/assinaturas/${orderId}.png`

  const { error: uploadError } = await supabase.storage
    .from('evidencias')
    .upload(caminho, blob, { contentType: 'image/png', upsert: true })
  if (uploadError) return { erro: uploadError.message }

  const signedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('orders')
    .update({ signature_path: caminho, signer_name: signerName, signed_at: signedAt })
    .eq('id', orderId)
  if (updateError) return { erro: updateError.message }

  await registrarEvento(orderId, 'signed', { signer_name: signerName })

  return { path: caminho }
}

// URL assinada temporária para exibir a assinatura (bucket privado)
export async function urlAssinatura(path: string, segundos = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('evidencias')
    .createSignedUrl(path, segundos)
  if (error) return null
  return data.signedUrl
}
