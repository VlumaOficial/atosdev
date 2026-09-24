// Consulta pública de autenticidade (Edge Function verificar-foto).
// fetch direto com a chave pública — não depende da sessão do usuário
// logado, então funciona igual na página pública e dentro do app, mesmo
// logo depois de o celular devolver a aba do segundo plano.

export interface ResultadoVerificacao {
  encontrado: boolean
  motivo?: string
  codigo?: string
  tipo?: 'foto' | 'relatorio'
  empresa?: string | null
  os?: string | null
  carimbado_em?: string | null
  enviado_em?: string
  divergencia_relogio_min?: number | null
  arquivo_disponivel?: boolean
  removido_em?: string | null
  integra?: boolean | null
  sha256?: string
  url_foto?: string | null
}

export async function consultarVerificacao(codigo: string): Promise<ResultadoVerificacao> {
  const c = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')
  try {
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verificar-foto?codigo=${encodeURIComponent(c)}`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    })
    return (await r.json()) as ResultadoVerificacao
  } catch {
    return { encontrado: false, motivo: 'erro' }
  }
}

export function linkVerificacao(codigo: string): string {
  return `${window.location.origin}/verificar/${codigo}`
}
