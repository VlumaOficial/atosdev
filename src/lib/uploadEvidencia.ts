import { supabase } from '@/lib/supabase'
import { urlLogoEmpresa } from '@/lib/uploadLogo'
import type { Coordenadas } from '@/lib/geolocation'
import { obterEndereco } from '@/lib/geocodificacao'

const LARGURA_MAX = 1600
const QUALIDADE = 0.8
const TAMANHO_MAX = 5 * 1024 * 1024 // 5MB

interface DadosCarimbo {
  tenantName: string
  logoUrl: string | null
  coords: Coordenadas
  endereco?: string | null
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

// Carimbo no padrão "foto de prova de campo" (modelo aprovado pelo usuário
// em 2026-09-23): sem faixa sólida — texto branco com sombra sobre a foto,
// hora em destaque, divisor amarelo, data/dia, endereço e coordenadas no
// canto inferior esquerdo; logo da empresa num cartão branco acima; marca
// ATOS no canto superior direito. Todas as medidas são proporcionais ao
// MENOR lado da foto, pra ficar igual em retrato e paisagem.
const COR_ATOS = '#8b5cf6'
const COR_ATOS_SUB = '#cbd5e1'
const COR_DIVISOR = '#facc15'

function comSombra(ctx: CanvasRenderingContext2D, u: number) {
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)'
  ctx.shadowBlur = 0.8 * u
  ctx.shadowOffsetX = 0.15 * u
  ctx.shadowOffsetY = 0.15 * u
}

function semSombra(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, larguraMax: number): string[] {
  const palavras = texto.split(/\s+/)
  const linhas: string[] = []
  let atual = ''
  for (const p of palavras) {
    const teste = atual ? atual + ' ' + p : p
    if (ctx.measureText(teste).width > larguraMax && atual) {
      linhas.push(atual)
      atual = p
    } else {
      atual = teste
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

function retanguloArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
  ctx.fill()
}

function desenharCarimbo(
  ctx: CanvasRenderingContext2D,
  largura: number,
  altura: number,
  dados: DadosCarimbo,
  logo: HTMLImageElement | null,
  quando: Date
) {
  const u = Math.min(largura, altura) / 100
  const margem = 3.5 * u
  const fonte = 'Roboto, "Segoe UI", Arial, sans-serif'

  // degradê leve na base — garante leitura sobre fundo claro sem a faixa sólida
  const alturaDegrade = Math.min(altura * 0.45, 45 * u)
  const grad = ctx.createLinearGradient(0, altura - alturaDegrade, 0, altura)
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)')
  ctx.fillStyle = grad
  ctx.fillRect(0, altura - alturaDegrade, largura, alturaDegrade)

  // --- marca ATOS (canto superior direito)
  comSombra(ctx, u)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillStyle = COR_ATOS
  ctx.font = `bold ${4.6 * u}px ${fonte}`
  ctx.fillText('ATOS', largura - margem, margem)
  ctx.fillStyle = COR_ATOS_SUB
  ctx.font = `${2.6 * u}px ${fonte}`
  ctx.fillText('Gestão de Campo', largura - margem, margem + 5.2 * u)

  // --- bloco inferior esquerdo, desenhado de baixo pra cima
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const larguraTexto = largura - 2 * margem
  let y = altura - margem

  // coordenadas (linha pequena — é a prova "dura" da localização)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.font = `${2.6 * u}px ${fonte}`
  ctx.fillText(`${dados.coords.lat.toFixed(6)}, ${dados.coords.lng.toFixed(6)}`, margem, y)
  y -= 2.6 * u + 1.8 * u

  // endereço (opcional — preenchido quando houver geocodificação)
  if (dados.endereco) {
    const tamEnd = 4 * u
    ctx.fillStyle = '#ffffff'
    ctx.font = `${tamEnd}px ${fonte}`
    const linhas = quebrarLinhas(ctx, dados.endereco, Math.min(larguraTexto, 75 * u)).slice(0, 3)
    for (let i = linhas.length - 1; i >= 0; i--) {
      ctx.fillText(linhas[i], margem, y)
      y -= tamEnd * 1.2
    }
    y -= 1.2 * u
  }

  // hora em destaque + divisor amarelo + data / dia da semana
  const tamHora = 12 * u
  const capHora = tamHora * 0.72
  const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const data = quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const diaBruto = quando.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const dia = diaBruto.charAt(0).toUpperCase() + diaBruto.slice(1)

  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${tamHora}px ${fonte}`
  ctx.fillText(hora, margem, y)
  const xDivisor = margem + ctx.measureText(hora).width + 2.2 * u
  semSombra(ctx)
  ctx.fillStyle = COR_DIVISOR
  ctx.fillRect(xDivisor, y - capHora, 0.55 * u, capHora)
  comSombra(ctx, u)
  const tamData = 4.4 * u
  ctx.fillStyle = '#ffffff'
  ctx.font = `${tamData}px ${fonte}`
  ctx.fillText(data, xDivisor + 2.2 * u, y - capHora + tamData * 0.8)
  ctx.fillText(dia, xDivisor + 2.2 * u, y)
  y -= capHora + 3 * u

  // logo da empresa num cartão branco (ou o nome, se não houver logo)
  if (logo && logo.naturalWidth && logo.naturalHeight) {
    const alturaCartao = 8 * u
    const pad = 0.9 * u
    const alturaLogo = alturaCartao - 2 * pad
    const larguraLogo = Math.min(alturaLogo * (logo.naturalWidth / logo.naturalHeight), 30 * u)
    const larguraCartao = larguraLogo + 2 * pad
    ctx.fillStyle = '#ffffff'
    retanguloArredondado(ctx, margem, y - alturaCartao, larguraCartao, alturaCartao, 1 * u)
    semSombra(ctx)
    ctx.drawImage(logo, margem + pad, y - alturaCartao + pad, larguraLogo, alturaLogo)
  } else if (dados.tenantName) {
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${4.4 * u}px ${fonte}`
    ctx.fillText(dados.tenantName, margem, y)
  }
  semSombra(ctx)
}

// Comprime a imagem e desenha o carimbo (logo + nome da empresa +
// data/hora + GPS) no mesmo canvas, antes de exportar — só a versão
// carimbada é guardada, o original nunca sai do navegador.
async function comprimirECarimbar(file: File, dados: DadosCarimbo): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file

  // Fotos de câmera de celular podem vir em resolução muito alta
  // (12MP+) mesmo quando o arquivo em si não é grande em bytes (câmeras
  // modernas comprimem bem) — então NÃO dá pra decidir pelo tamanho do
  // arquivo se é seguro decodificar inteiro. Sempre pede pro navegador
  // já decodificar redimensionado (um passo só, nunca materializa a
  // imagem em resolução total em memória). Se o navegador não suportar
  // esses parâmetros, cai pro modo normal (mais lento, mas funcional).
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { resizeWidth: LARGURA_MAX, resizeQuality: 'medium' })
  } catch {
    bitmap = await createImageBitmap(file)
  }

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

  let logo: HTMLImageElement | null = null
  if (dados.logoUrl) {
    try {
      logo = await carregarImagem(dados.logoUrl)
    } catch {
      // segue sem logo se a imagem falhar ao carregar (ex: CORS, arquivo corrompido)
    }
  }
  desenharCarimbo(ctx, largura, altura, dados, logo, new Date())

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
  // endereço em paralelo com os dados do tenant — nunca bloqueia (null = só coordenadas)
  const [dados, endereco] = await Promise.all([buscarDadosTenant(), obterEndereco(coords)])
  if ('erro' in dados) return { path: '', erro: dados.erro }

  const carimbada = await comprimirECarimbar(file, { tenantName: dados.tenantName, logoUrl: dados.logoUrl, coords, endereco })

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
  // endereço em paralelo com os dados do tenant — nunca bloqueia (null = só coordenadas)
  const [dados, endereco] = await Promise.all([buscarDadosTenant(), obterEndereco(coords)])
  if ('erro' in dados) return { path: '', erro: dados.erro }

  const carimbada = await comprimirECarimbar(file, { tenantName: dados.tenantName, logoUrl: dados.logoUrl, coords, endereco })

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

// URL assinada que força download (Content-Disposition: attachment),
// com nome de arquivo amigável
export async function urlDownloadEvidencia(path: string, nomeArquivo?: string): Promise<string | null> {
  const nome = nomeArquivo ?? ('evidencia-' + (path.split('/').pop() ?? 'foto.jpg'))
  const { data, error } = await supabase.storage
    .from('evidencias')
    .createSignedUrl(path, 3600, { download: nome })
  if (error) return null
  return data.signedUrl
}

// Remove uma evidencia
export async function removerEvidencia(path: string): Promise<boolean> {
  const { error } = await supabase.storage.from('evidencias').remove([path])
  return !error
}
