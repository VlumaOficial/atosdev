import { supabase } from '@/lib/supabase'
import { urlLogoEmpresa } from '@/lib/uploadLogo'
import type { Coordenadas } from '@/lib/geolocation'

const LARGURA_MAX = 1600
const QUALIDADE = 0.8
const TAMANHO_MAX = 5 * 1024 * 1024 // 5MB

interface DadosCarimbo {
  tenantName: string
  logoUrl: string | null
  coords: Coordenadas
}

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// Comprime a imagem e desenha o carimbo (logo + nome da empresa +
// data/hora + GPS) no mesmo canvas, antes de exportar — só a versão
// carimbada é guardada, o original nunca sai do navegador.
async function comprimirECarimbar(file: File, dados: DadosCarimbo): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file

  // Fotos de câmera de celular podem vir em resolução muito alta
  // (12MP+). Decodificar o arquivo inteiro em memória antes de
  // redimensionar pode estourar a memória em aparelhos mais fracos.
  // Acima de 2MB, pede pro navegador já decodificar redimensionado
  // (um passo só, sem nunca materializar a imagem em resolução total).
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

  // barra semi-transparente na base, pra garantir contraste com o texto
  // independente do conteúdo da foto
  const alturaBarra = Math.max(48, Math.round(altura * 0.14))
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, altura - alturaBarra, largura, alturaBarra)

  let xTexto = 10
  const logoTamanho = alturaBarra - 12
  if (dados.logoUrl) {
    try {
      const logo = await carregarImagem(dados.logoUrl)
      const yLogo = altura - alturaBarra + 6
      ctx.drawImage(logo, xTexto, yLogo, logoTamanho, logoTamanho)
      xTexto += logoTamanho + 10
    } catch {
      // segue sem logo se a imagem falhar ao carregar (ex: CORS, arquivo corrompido)
    }
  }

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 13px sans-serif'
  ctx.textBaseline = 'top'
  const yLinha1 = altura - alturaBarra + 6
  const yLinha2 = yLinha1 + 17
  ctx.fillText(dados.tenantName, xTexto, yLinha1)

  ctx.font = '12px sans-serif'
  const agora = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const coordsTexto = `${dados.coords.lat.toFixed(6)}, ${dados.coords.lng.toFixed(6)}`
  ctx.fillText(`${agora} · ${coordsTexto}`, xTexto, yLinha2)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', QUALIDADE)
  })
}

export interface UploadResult {
  path: string
  erro?: string
}

interface DadosTenant {
  tenantId: string
  tenantName: string
  logoUrl: string | null
}

async function buscarDadosTenant(): Promise<DadosTenant | { erro: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Sessão expirada. Faça login novamente.' }

  const { data: perfil } = await supabase
    .from('users')
    .select('tenant_id, tenants(name)')
    .eq('id', user.id)
    .single()

  const tenantId = perfil?.tenant_id
  if (!tenantId) return { erro: 'Usuário sem empresa vinculada.' }
  const tenantName = (perfil as any)?.tenants?.name ?? ''
  const logoUrl = await urlLogoEmpresa()

  return { tenantId, tenantName, logoUrl }
}

// Envia a evidencia carimbada para o bucket, no caminho {tenant}/checklist/{instanceId}/{arquivo}
export async function uploadEvidenciaChecklist(
  file: File,
  instanceId: string,
  fieldId: string,
  coords: Coordenadas
): Promise<UploadResult> {
  const dados = await buscarDadosTenant()
  if ('erro' in dados) return { path: '', erro: dados.erro }

  const carimbada = await comprimirECarimbar(file, { tenantName: dados.tenantName, logoUrl: dados.logoUrl, coords })

  if (carimbada.size > TAMANHO_MAX) {
    return { path: '', erro: 'Arquivo muito grande (máximo 5MB).' }
  }

  const nome = `${fieldId}-${Date.now()}.jpg`
  const caminho = `${dados.tenantId}/checklist/${instanceId}/${nome}`

  const { error } = await supabase.storage
    .from('evidencias')
    .upload(caminho, carimbada, { contentType: 'image/jpeg', upsert: false })

  if (error) return { path: '', erro: error.message }
  return { path: caminho }
}

// Envia uma evidencia carimbada vinculada direto a uma OS (sem checklist),
// no caminho {tenant}/os/{orderId}/{arquivo}
export async function uploadEvidenciaOS(
  file: File,
  orderId: string,
  coords: Coordenadas
): Promise<UploadResult> {
  const dados = await buscarDadosTenant()
  if ('erro' in dados) return { path: '', erro: dados.erro }

  const carimbada = await comprimirECarimbar(file, { tenantName: dados.tenantName, logoUrl: dados.logoUrl, coords })

  if (carimbada.size > TAMANHO_MAX) {
    return { path: '', erro: 'Arquivo muito grande (máximo 5MB).' }
  }

  const nome = `${Date.now()}.jpg`
  const caminho = `${dados.tenantId}/os/${orderId}/${nome}`

  const { error } = await supabase.storage
    .from('evidencias')
    .upload(caminho, carimbada, { contentType: 'image/jpeg', upsert: false })

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
