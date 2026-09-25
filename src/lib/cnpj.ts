// Consulta de CNPJ na base pública da Receita Federal (via BrasilAPI —
// gratuita, sem chave, CORS liberado). Decisão do usuário 2026-09-24:
// usada pelo Super Admin para preencher/conferir a identidade legal da
// empresa, e a SER REUSADA na contratação SaaS (F8 — auto-cadastro:
// preencher razão social, bloquear CNPJ inativo, evitar cadastro
// duplicado). Isolada neste arquivo: trocar de fonte = mexer só aqui.

export interface DadosReceita {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  situacao: string            // ex.: ATIVA, BAIXADA, INAPTA, SUSPENSA
  ativa: boolean
  municipio: string | null
  uf: string | null
  telefone: string | null
  email: string | null
  // endereço do estabelecimento (reuso no cadastro de Cliente — 2026-09-25)
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidadeIbge: string | null
}

export async function consultarCnpjReceita(cnpj: string): Promise<DadosReceita | { erro: string }> {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return { erro: 'Informe os 14 dígitos do CNPJ.' }
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 10000)
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, { signal: ctl.signal })
    if (r.status === 404) return { erro: 'CNPJ não encontrado na Receita Federal.' }
    if (!r.ok) return { erro: 'Consulta à Receita indisponível agora. Tente de novo ou preencha manualmente.' }
    const j = await r.json()
    const tel = j.ddd_telefone_1 ? String(j.ddd_telefone_1).replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : null
    return {
      cnpj: d,
      razaoSocial: j.razao_social ?? '',
      nomeFantasia: j.nome_fantasia || null,
      situacao: j.descricao_situacao_cadastral ?? '—',
      ativa: String(j.descricao_situacao_cadastral ?? '').toUpperCase() === 'ATIVA',
      municipio: j.municipio ?? null,
      uf: j.uf ?? null,
      telefone: tel,
      email: j.email ? String(j.email).toLowerCase() : null,
      cep: j.cep ? String(j.cep).replace(/\D/g, '').padStart(8, '0') : null,
      logradouro: j.logradouro ? [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ') : null,
      numero: j.numero ? (/^0*$/.test(String(j.numero)) ? 'S/N' : String(j.numero).replace(/^0+(?=\d)/, '')) : null,
      complemento: j.complemento || null,
      bairro: j.bairro || null,
      cidadeIbge: j.codigo_municipio_ibge ? String(j.codigo_municipio_ibge) : null,
    }
  } catch {
    return { erro: 'Consulta à Receita indisponível agora. Tente de novo ou preencha manualmente.' }
  } finally {
    clearTimeout(t)
  }
}

// A Receita devolve tudo em MAIÚSCULAS — formata para leitura
export function formatarRazaoSocial(s: string): string {
  const minusculas = new Set(['e', 'de', 'da', 'do', 'das', 'dos', 'em'])
  const siglas: Record<string, string> = { LTDA: 'Ltda.', 'LTDA.': 'Ltda.', ME: 'ME', EPP: 'EPP', EIRELI: 'EIRELI', 'S/A': 'S/A', 'S.A.': 'S.A.', SA: 'S.A.' }
  return s.trim().split(/\s+/).map((p, i) => {
    const up = p.toUpperCase()
    if (siglas[up]) return siglas[up]
    const low = p.toLowerCase()
    if (i > 0 && minusculas.has(low)) return low
    return low.charAt(0).toUpperCase() + low.slice(1)
  }).join(' ')
}
