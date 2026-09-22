import { supabase } from '@/lib/supabase'

const LARGURA_MAX = 400

// Redimensiona a logo antes de subir — ela vai ser embutida em toda
// foto carimbada, então precisa ser pequena.
async function redimensionarLogo(file: File): Promise<Blob> {
  // mesma proteção de memória do carimbo de evidências (uploadEvidencia.ts)
  const bitmap = file.size > 2 * 1024 * 1024
    ? await createImageBitmap(file, { resizeWidth: LARGURA_MAX, resizeQuality: 'medium' })
    : await createImageBitmap(file)
  const escala = Math.min(1, LARGURA_MAX / bitmap.width)
  const largura = Math.round(bitmap.width * escala)
  const altura = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close()

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/png')
  })
}

export interface UploadLogoResult {
  erro?: string
}

// Path fixo por tenant — a própria existência do arquivo é a "config"
// (sem coluna nova no banco).
export async function uploadLogoEmpresa(file: File): Promise<UploadLogoResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Sessão expirada. Faça login novamente.' }

  const { data: perfil } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  const tenantId = perfil?.tenant_id
  if (!tenantId) return { erro: 'Usuário sem empresa vinculada.' }

  const redimensionada = await redimensionarLogo(file)
  const caminho = `${tenantId}/logo.png`

  const { error } = await supabase.storage
    .from('evidencias')
    .upload(caminho, redimensionada, { contentType: 'image/png', upsert: true })

  if (error) return { erro: error.message }
  return {}
}

// URL assinada da logo do tenant do usuário logado, ou null se não existir.
export async function urlLogoEmpresa(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return null
  const { data, error } = await supabase.storage
    .from('evidencias')
    .createSignedUrl(`${perfil.tenant_id}/logo.png`, 3600)
  if (error) return null
  return data.signedUrl
}
