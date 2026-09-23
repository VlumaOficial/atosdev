import { supabase } from '@/lib/supabase'
import { urlLogoEmpresa } from '@/lib/uploadLogo'
import type { Coordenadas } from '@/lib/geolocation'
import { obterEndereco } from '@/lib/geocodificacao'
import { resolverConfigCarimbo, type ConfigCarimbo } from '@/lib/carimboConfig'

// Limite no MAIOR lado (retrato ou paisagem). Antes era só na largura:
// retrato saía 1600×2845 — ~3× o espaço da paisagem, e ainda AMPLIADO
// (o quadro da câmera é 1080×1920). Auditoria de armazenamento 2026-09-23.
const LADO_MAX = 1600
const QUALIDADE = 0.8
// Miniatura só para listas/cards — a foto cheia só é baixada ao abrir em
// tela cheia, baixar ou gerar PDF (economia de tráfego/egress)
const LADO_MINIATURA = 400
const QUALIDADE_MINIATURA = 0.7
const TAMANHO_MAX = 5 * 1024 * 1024 // 5MB

export interface ContextoCarimbo {
  numeroOs?: string | null
  unidade?: string | null
  tecnico?: string | null
}

export interface DadosCarimbo {
  tenantName: string
  logoUrl: string | null
  coords: Coordenadas
  endereco?: string | null
  config: ConfigCarimbo
  contexto?: ContextoCarimbo
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
const COR_ATOS_SUB = '#ffffff' // branco + sombra: legível também sobre fundo claro (antes cinza, sumia)
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
  const palavras = texto.split(/ +/) // só espaço comum — o não-separável (\u00A0) mantém "Téc. Nome" junto
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

export function desenharCarimbo(
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
  // (ordem visual, de cima pra baixo: logo, nome da empresa, OS/unidade/
  // técnico, hora|data/dia, endereço, coordenadas)
  const cfg = dados.config
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const larguraTexto = largura - 2 * margem
  let y = altura - margem

  // coordenadas (linha pequena — é a prova "dura" da localização)
  if (cfg.coordenadas) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.font = `${2.6 * u}px ${fonte}`
    ctx.fillText(`${dados.coords.lat.toFixed(6)}, ${dados.coords.lng.toFixed(6)}`, margem, y)
    y -= 2.6 * u + 1.8 * u
  }

  // endereço (quando houver geocodificação)
  if (cfg.endereco && dados.endereco) {
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
  const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const data = quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const diaBruto = quando.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const dia = diaBruto.charAt(0).toUpperCase() + diaBruto.slice(1)
  const tamData = 4.4 * u
  ctx.fillStyle = '#ffffff'

  if (cfg.hora) {
    const tamHora = 12 * u
    const capHora = tamHora * 0.72
    ctx.font = `bold ${tamHora}px ${fonte}`
    ctx.fillText(hora, margem, y)
    if (cfg.data || cfg.dia_semana) {
      const xDivisor = margem + ctx.measureText(hora).width + 2.2 * u
      semSombra(ctx)
      ctx.fillStyle = COR_DIVISOR
      ctx.fillRect(xDivisor, y - capHora, 0.55 * u, capHora)
      comSombra(ctx, u)
      ctx.fillStyle = '#ffffff'
      ctx.font = `${tamData}px ${fonte}`
      const xData = xDivisor + 2.2 * u
      if (cfg.data && cfg.dia_semana) {
        ctx.fillText(data, xData, y - capHora + tamData * 0.8)
        ctx.fillText(dia, xData, y)
      } else {
        ctx.fillText(cfg.data ? data : dia, xData, y - capHora / 2 + tamData * 0.35)
      }
    }
    y -= capHora + 3 * u
  } else if (cfg.data || cfg.dia_semana) {
    ctx.font = `bold ${tamData * 1.3}px ${fonte}`
    ctx.fillText([cfg.data && data, cfg.dia_semana && dia].filter(Boolean).join(' · '), margem, y)
    y -= tamData * 1.3 + 2 * u
  }

  // contexto do atendimento: OS · unidade · técnico
  const ctxAtend = dados.contexto
  const partes = [
    cfg.numero_os && ctxAtend?.numeroOs,
    cfg.unidade && ctxAtend?.unidade,
    cfg.tecnico && ctxAtend?.tecnico && `Téc.\u00A0${ctxAtend.tecnico}`,
  ].filter(Boolean) as string[]
  if (partes.length) {
    const tamCtx = 3.4 * u
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${tamCtx}px ${fonte}`
    const linhas = quebrarLinhas(ctx, partes.join(' · '), Math.min(larguraTexto, 80 * u)).slice(0, 2)
    for (let i = linhas.length - 1; i >= 0; i--) {
      ctx.fillText(linhas[i], margem, y)
      y -= tamCtx * 1.25
    }
    y -= 1.2 * u
  }

  // nome da empresa — ligado na config, ou como substituto da logo ausente
  const temLogo = !!(logo && logo.naturalWidth && logo.naturalHeight)
  const mostrarLogo = cfg.logo && temLogo
  if (dados.tenantName && (cfg.nome_empresa || (cfg.logo && !temLogo))) {
    const tamNome = 4.4 * u
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${tamNome}px ${fonte}`
    ctx.fillText(dados.tenantName, margem, y)
    y -= tamNome + 1.5 * u
  }

  // logo da empresa num cartão branco
  if (mostrarLogo && logo) {
    const alturaCartao = 8 * u
    const pad = 0.9 * u
    const alturaLogo = alturaCartao - 2 * pad
    const larguraLogo = Math.min(alturaLogo * (logo.naturalWidth / logo.naturalHeight), 30 * u)
    const larguraCartao = larguraLogo + 2 * pad
    ctx.fillStyle = '#ffffff'
    retanguloArredondado(ctx, margem, y - alturaCartao, larguraCartao, alturaCartao, 1 * u)
    semSombra(ctx)
    ctx.drawImage(logo, margem + pad, y - alturaCartao + pad, larguraLogo, alturaLogo)
  }
  semSombra(ctx)
}

// Comprime a imagem e desenha o carimbo (logo + nome da empresa +
// data/hora + GPS) no mesmo canvas, antes de exportar — só a versão
// carimbada é guardada, o original nunca sai do navegador.
interface FotoProcessada {
  principal: Blob
  miniatura: Blob | null
}

function paraBlob(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(b => resolve(b), 'image/jpeg', qualidade))
}

async function comprimirECarimbar(file: File, dados: DadosCarimbo): Promise<FotoProcessada> {
  if (!file.type.startsWith('image/')) return { principal: file, miniatura: null }

  // Fotos de câmera de celular podem vir em resolução muito alta
  // (12MP+) mesmo quando o arquivo em si não é grande em bytes — o
  // tamanho do arquivo não indica resolução. As dimensões são lidas do
  // cabeçalho do JPEG (sem decodificar a imagem) e o navegador já
  // decodifica no tamanho final, num passo só: nunca materializa a foto
  // em resolução total em memória e nunca AMPLIA uma foto pequena.
  // Formato desconhecido (sem cabeçalho legível): decodifica pela largura
  // e o canvas ajusta pelo maior lado.
  const dim = await dimensoesJpeg(file).catch(() => null)
  let bitmap: ImageBitmap
  try {
    if (dim) {
      const escalaAlvo = Math.min(1, LADO_MAX / Math.max(dim.w, dim.h))
      bitmap = escalaAlvo < 1
        ? await createImageBitmap(file, { resizeWidth: Math.round(dim.w * escalaAlvo), resizeQuality: 'medium' })
        : await createImageBitmap(file)
    } else {
      bitmap = await createImageBitmap(file, { resizeWidth: LADO_MAX, resizeQuality: 'medium' })
    }
  } catch {
    bitmap = await createImageBitmap(file)
  }

  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
  const largura = Math.round(bitmap.width * escala)
  const altura = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) return { principal: file, miniatura: null }
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

  const principal = (await paraBlob(canvas, QUALIDADE)) ?? file

  // miniatura a partir do canvas JÁ carimbado (mesma imagem, só menor)
  let miniatura: Blob | null = null
  const escalaMini = Math.min(1, LADO_MINIATURA / Math.max(largura, altura))
  const mini = document.createElement('canvas')
  mini.width = Math.round(largura * escalaMini)
  mini.height = Math.round(altura * escalaMini)
  const ctxMini = mini.getContext('2d')
  if (ctxMini) {
    ctxMini.drawImage(canvas, 0, 0, mini.width, mini.height)
    miniatura = await paraBlob(mini, QUALIDADE_MINIATURA)
  }
  return { principal, miniatura }
}

// Lê largura/altura do cabeçalho JPEG (marcador SOF) já considerando a
// orientação EXIF, sem decodificar a imagem. null se não for JPEG legível.
async function dimensoesJpeg(file: File): Promise<{ w: number; h: number } | null> {
  const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer())
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null
  let off = 2
  let orientacao = 1
  while (off + 9 < v.byteLength) {
    if (v.getUint8(off) !== 0xFF) return null
    const marcador = v.getUint8(off + 1)
    const tamanho = v.getUint16(off + 2)
    if (marcador === 0xE1) orientacao = orientacaoExif(v, off + 4, tamanho - 2) ?? orientacao
    if (marcador >= 0xC0 && marcador <= 0xCF && marcador !== 0xC4 && marcador !== 0xC8 && marcador !== 0xCC) {
      const h = v.getUint16(off + 5)
      const w = v.getUint16(off + 7)
      return orientacao >= 5 && orientacao <= 8 ? { w: h, h: w } : { w, h }
    }
    off += 2 + tamanho
  }
  return null
}

function orientacaoExif(v: DataView, inicio: number, tamanho: number): number | null {
  // "Exif\0\0" + cabeçalho TIFF
  if (tamanho < 14 || v.getUint32(inicio) !== 0x45786966) return null
  const tiff = inicio + 6
  const le = v.getUint16(tiff) === 0x4949
  const ifd0 = tiff + v.getUint32(tiff + 4, le)
  if (ifd0 + 2 > v.byteLength) return null
  const entradas = v.getUint16(ifd0, le)
  for (let i = 0; i < entradas; i++) {
    const e = ifd0 + 2 + i * 12
    if (e + 12 > v.byteLength) return null
    if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le)
  }
  return null
}

export interface UploadResult {
  path: string
  erro?: string
}

interface DadosTenant {
  tenantId: string
  tenantName: string
  logoUrl: string | null
  config: ConfigCarimbo
  nomeUsuario: string | null
}

async function buscarDadosTenant(): Promise<DadosTenant | { erro: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Sessão expirada. Faça login novamente.' }

  const { data: perfil } = await supabase
    .from('users')
    .select('tenant_id, name, tenants(name, stamp_config)')
    .eq('id', user.id)
    .single()

  const tenantId = perfil?.tenant_id
  if (!tenantId) return { erro: 'Usuário sem empresa vinculada.' }
  const tenantName = (perfil as any)?.tenants?.name ?? ''
  const config = resolverConfigCarimbo((perfil as any)?.tenants?.stamp_config)
  const logoUrl = config.logo ? await urlLogoEmpresa() : null

  return { tenantId, tenantName, logoUrl, config, nomeUsuario: (perfil as any)?.name ?? null }
}

// Busca só o que a config do tenant pede — endereço (serviço externo) e
// contexto da OS (consulta ao banco) ficam de fora quando desligados.
// Endereço nunca bloqueia: null = carimbo só com coordenadas.
async function carimbar(
  file: File,
  dados: DadosTenant,
  coords: Coordenadas,
  buscarContexto: () => Promise<ContextoCarimbo>
): Promise<FotoProcessada> {
  const cfg = dados.config
  const [endereco, contexto] = await Promise.all([
    cfg.endereco ? obterEndereco(coords) : Promise.resolve(null),
    cfg.numero_os || cfg.unidade ? buscarContexto().catch(() => ({})) : Promise.resolve({} as ContextoCarimbo),
  ])
  return comprimirECarimbar(file, {
    tenantName: dados.tenantName,
    logoUrl: dados.logoUrl,
    coords,
    endereco,
    config: cfg,
    contexto: { ...contexto, tecnico: cfg.tecnico ? dados.nomeUsuario : null },
  })
}

async function contextoDaOS(orderId: string): Promise<ContextoCarimbo> {
  const { data } = await supabase
    .from('orders')
    .select('number, locations(name)')
    .eq('id', orderId)
    .single()
  return { numeroOs: (data as any)?.number ?? null, unidade: (data as any)?.locations?.name ?? null }
}

async function contextoDoChecklist(instanceId: string): Promise<ContextoCarimbo> {
  const { data } = await supabase
    .from('checklist_instances')
    .select('locations(name), orders(number, locations(name))')
    .eq('id', instanceId)
    .single()
  const d = data as any
  return {
    numeroOs: d?.orders?.number ?? null,
    unidade: d?.locations?.name ?? d?.orders?.locations?.name ?? null,
  }
}

// Miniatura fica ao lado da foto, com nome derivado — sem coluna no
// banco. Fotos antigas (antes de 2026-09-23) não têm miniatura: quem
// exibe cai para a foto cheia.
export function caminhoMiniatura(path: string): string {
  return path.replace(/\.jpg$/i, '') + '_mini.jpg'
}

async function enviarFoto(foto: FotoProcessada, caminho: string): Promise<UploadResult> {
  if (foto.principal.size > TAMANHO_MAX) {
    return { path: '', erro: 'Arquivo muito grande (máximo 5MB).' }
  }
  const { error } = await supabase.storage
    .from('evidencias')
    .upload(caminho, foto.principal, { contentType: 'image/jpeg', upsert: false })
  if (error) return { path: '', erro: error.message }

  // miniatura é otimização: se falhar, a evidência continua valendo
  if (foto.miniatura) {
    await supabase.storage
      .from('evidencias')
      .upload(caminhoMiniatura(caminho), foto.miniatura, { contentType: 'image/jpeg', upsert: false })
      .catch(() => {})
  }
  return { path: caminho }
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
  const foto = await carimbar(file, dados, coords, () => contextoDoChecklist(instanceId))
  const nome = `${fieldId}-${Date.now()}.jpg`
  return enviarFoto(foto, `${dados.tenantId}/checklist/${instanceId}/${nome}`)
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
  const foto = await carimbar(file, dados, coords, () => contextoDaOS(orderId))
  const nome = `${Date.now()}.jpg`
  return enviarFoto(foto, `${dados.tenantId}/os/${orderId}/${nome}`)
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

// URL da miniatura (listas/cards); cai para a foto cheia se não houver
export async function urlMiniaturaEvidencia(path: string, segundos = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('evidencias')
    .createSignedUrl(caminhoMiniatura(path), segundos)
  if (!error && data?.signedUrl) return data.signedUrl
  return urlEvidencia(path, segundos)
}

// Remove uma evidencia (e a miniatura, se houver)
export async function removerEvidencia(path: string): Promise<boolean> {
  const { error } = await supabase.storage.from('evidencias').remove([path, caminhoMiniatura(path)])
  return !error
}
