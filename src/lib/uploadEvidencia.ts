import { supabase } from '@/lib/supabase'

const LARGURA_MAX = 1600
const QUALIDADE = 0.8
const TAMANHO_MAX = 5 * 1024 * 1024 // 5MB

// Comprime a imagem no navegador antes de enviar
async function comprimirImagem(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file

  const bitmap = await createImageBitmap(file)
  const escala = Math.min(1, LARGURA_MAX / bitmap.width)
  const largura = Math.round(bitmap.width * escala)
  const altura = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, largura, altura)

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      'image/jpeg',
      QUALIDADE
    )
  })
}

export interface UploadResult {
  path: string
  erro?: string
}

// Envia a evidencia para o bucket, no caminho {tenant}/checklist/{instanceId}/{arquivo}
export async function uploadEvidenciaChecklist(
  file: File,
  instanceId: string,
  fieldId: string
): Promise<UploadResult> {
  // tenant do usuario logado
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { path: '', erro: 'Sessão expirada. Faça login novamente.' }

  const { data: perfil } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  const tenantId = perfil?.tenant_id
  if (!tenantId) return { path: '', erro: 'Usuário sem empresa vinculada.' }

  const comprimido = await comprimirImagem(file)

  if (comprimido.size > TAMANHO_MAX) {
    return { path: '', erro: 'Arquivo muito grande (máximo 5MB).' }
  }

  const ext = 'jpg'
  const nome = `${fieldId}-${Date.now()}.${ext}`
  const caminho = `${tenantId}/checklist/${instanceId}/${nome}`

  const { error } = await supabase.storage
    .from('evidencias')
    .upload(caminho, comprimido, { contentType: 'image/jpeg', upsert: false })

  if (error) return { path: '', erro: error.message }
  return { path: caminho }
}

// Gera URL assinada temporaria para exibir a evidencia (bucket privado)
export async function urlEvidencia(path: string, segundos = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('evidencias')
    .createSignedUrl(path, segundos)
  if (error) return null
  return data.signedUrl
}

// Remove uma evidencia
export async function removerEvidencia(path: string): Promise<boolean> {
  const { error } = await supabase.storage.from('evidencias').remove([path])
  return !error
}
