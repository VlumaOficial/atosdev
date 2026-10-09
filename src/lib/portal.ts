import { supabase } from '@/lib/supabase'

// Portal de atendimento (Etapa 1 · E1). Desenho em VISAO_ATOS.md 9.1.
// O portal é a mesma aplicação, aberta de dois jeitos:
//   * pelo host (subdomínio VLUMA "atendimento.<empresa>.<domínio>" ou
//     domínio próprio da empresa) — a raiz do site é o portal
//   * pelo caminho interno "/portal/<nome curto>" (teste e contingência)

export type TipoTermo = 'uso' | 'privacidade' | 'comunicacao'
export const TIPOS_TERMO: { tipo: TipoTermo; rotulo: string }[] = [
  { tipo: 'uso', rotulo: 'Termos de uso' },
  { tipo: 'privacidade', rotulo: 'Aviso de privacidade' },
  { tipo: 'comunicacao', rotulo: 'Consentimento de comunicação' },
]

export interface PortalIdentidade {
  disponivel: boolean
  motivo?: 'nao_encontrado' | 'indisponivel'
  redirecionar?: string
  previa?: boolean
  tenant_id?: string
  slug?: string
  nome?: string
  empresa?: string
  cor?: string | null
  boas_vindas?: string | null
  contatos?: { email?: string; telefone?: string; whatsapp?: string; site?: string }
  logo_versao?: number | null
  termos?: { tipo: TipoTermo; titulo: string; versao: number }[]
}

export interface TermoPendente { id: string; tipo: TipoTermo; versao: number; titulo: string; texto: string }

export interface PortalContexto {
  logado: boolean
  acesso?: boolean
  interno?: boolean
  pessoa?: { nome: string; email: string }
  vinculos?: { client_id: string; cliente: string; perfil: 'supervisor' | 'usuario' }[]
  termos_pendentes?: TermoPendente[]
}

// Hosts que são o próprio ATOS (painel) — nunca são portal pelo host
const HOSTS_DO_PAINEL = ['localhost', '127.0.0.1', 'atosdev.vercel.app']

export function hostEhPortal(host = window.location.hostname): boolean {
  const h = host.toLowerCase()
  if (HOSTS_DO_PAINEL.includes(h) || h.endsWith('.vercel.app')) return false
  return true
}

// Base das rotas do portal: '' no host próprio, '/portal/<slug>' no caminho interno
export function basePortal(slug?: string): string {
  return hostEhPortal() ? '' : `/portal/${slug ?? ''}`
}

export async function resolverPortal(slug?: string): Promise<PortalIdentidade> {
  const { data, error } = await supabase.rpc('portal_resolver', {
    p_slug: slug ?? null,
    p_host: hostEhPortal() ? window.location.hostname : null,
  })
  if (error) throw error
  return data as PortalIdentidade
}

export function urlLogoPortal(tenantId: string, versao?: number | null): string | null {
  if (!versao) return null
  const base = import.meta.env.VITE_SUPABASE_URL as string
  return `${base}/storage/v1/object/public/portal-publico/${tenantId}/logo.png?v=${versao}`
}

// Atualiza a cópia pública da logo (bucket portal-publico) a partir de um
// arquivo/blob já preparado. Só o admin consegue (regra do storage).
export async function publicarLogoPortal(tenantId: string, blob: Blob): Promise<string | null> {
  const { error } = await supabase.storage.from('portal-publico')
    .upload(`${tenantId}/logo.png`, blob, { contentType: 'image/png', upsert: true, cacheControl: '3600' })
  if (error) return error.message
  const { error: e2 } = await supabase.rpc('portal_logo_atualizada')
  return e2 ? e2.message : null
}

// ---- cor da empresa ----
function hexParaHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}

// Variáveis de tema do portal a partir da cor da empresa. O fundo do ATOS é
// escuro: cores muito escuras (ex.: azul-marinho) ficariam ilegíveis em
// textos e bordas, então a luminosidade é levada para uma faixa legível
// mantendo o tom; o texto sobre o botão é branco ou preto conforme o caso.
export function temaDaCor(hex?: string | null): React.CSSProperties | undefined {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return undefined
  const [h, s, l] = hexParaHsl(hex)
  const l2 = Math.min(68, Math.max(52, l))
  const s2 = Math.max(s, 35)
  const textoEscuro = l2 >= 62 && (h > 40 && h < 200)   // amarelos/verdes claros pedem texto escuro
  return {
    ['--primary' as string]: `${h} ${s2}% ${l2}%`,
    ['--ring' as string]: `${h} ${s2}% ${l2}%`,
    ['--primary-foreground' as string]: textoEscuro ? '222 47% 7%' : '0 0% 100%',
  }
}

export function linkWhatsApp(numero?: string, texto?: string): string | null {
  if (!numero) return null
  const n = numero.replace(/\D/g, '')
  const comPais = n.length <= 11 ? '55' + n : n
  return `https://wa.me/${comPais}${texto ? '?text=' + encodeURIComponent(texto) : ''}`
}
