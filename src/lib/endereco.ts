// Endereço estruturado de Unidades (migration 036) — o Cliente usa o
// endereço da sua Unidade principal. CEP e CNPJ (Receita) preenchem os
// campos pela BrasilAPI (gratuita, sem chave); a cidade é sempre a do
// IBGE (código), base dos feriados estaduais/municipais.
import { cidadesDaUf, nomeCidade, ufDoIbge } from '@/lib/calendario'
import type { DadosReceita } from '@/lib/cnpj'

export interface Endereco {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  uf: string
  cidade_ibge: string
  cidade: string
}

export const ENDERECO_VAZIO: Endereco = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', uf: '', cidade_ibge: '', cidade: '' }

// linha da tabela locations → formulário
export function enderecoDaUnidade(l: {
  cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null
  bairro?: string | null; cidade_ibge?: string | null; city?: string | null; state?: string | null
} | null | undefined): Endereco {
  if (!l) return { ...ENDERECO_VAZIO }
  const ufTexto = l.state && /^[A-Za-z]{2}$/.test(l.state.trim()) ? l.state.trim().toUpperCase() : ''
  return {
    cep: l.cep ? mascaraCep(l.cep) : '', logradouro: l.logradouro ?? '', numero: l.numero ?? '',
    complemento: l.complemento ?? '', bairro: l.bairro ?? '',
    uf: ufDoIbge(l.cidade_ibge) ?? ufTexto, cidade_ibge: l.cidade_ibge ?? '', cidade: l.cidade_ibge ? (l.city ?? '') : '',
  }
}

// formulário → colunas de locations (address é montado pelo banco)
export function colunasEndereco(e: Endereco) {
  return {
    cep: e.cep.replace(/\D/g, '') || null,
    logradouro: e.logradouro.trim() || null,
    numero: e.numero.trim() || null,
    complemento: e.complemento.trim() || null,
    bairro: e.bairro.trim() || null,
    cidade_ibge: e.cidade_ibge || null,
    city: e.cidade_ibge ? e.cidade : null,
    state: e.uf || null,
  }
}

export function mascaraCep(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d
}

// A Receita e alguns CEPs vêm em MAIÚSCULAS
function titulo(s: string): string {
  if (s !== s.toUpperCase()) return s
  return nomeCidade(s)
}

async function ibgePorNome(uf: string, cidade: string): Promise<{ ibge: string; nome: string } | null> {
  const n = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
  try {
    const c = (await cidadesDaUf(uf)).find(x => n(x.nome) === n(cidade))
    return c ? { ibge: c.ibge, nome: c.nome } : null
  } catch { return null }
}

export async function consultarCep(cep: string): Promise<Partial<Endereco> | { erro: string }> {
  const d = cep.replace(/\D/g, '')
  if (d.length !== 8) return { erro: 'CEP precisa ter 8 dígitos.' }
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${d}`, { signal: ctl.signal })
    if (r.status === 404) return { erro: 'CEP não encontrado. Preencha o endereço manualmente.' }
    if (!r.ok) return { erro: 'Consulta de CEP indisponível agora. Preencha manualmente.' }
    const j = await r.json()
    const uf = String(j.state ?? '').toUpperCase()
    let ibge = j.ibge?.city ? String(j.ibge.city) : ''
    let cidade = j.city ? titulo(String(j.city)) : ''
    if (!ibge && uf && cidade) {
      const c = await ibgePorNome(uf, cidade)
      if (c) { ibge = c.ibge; cidade = c.nome }
    }
    return {
      cep: mascaraCep(d), logradouro: j.street ? titulo(String(j.street)) : '',
      bairro: j.neighborhood ? titulo(String(j.neighborhood)) : '', uf, cidade_ibge: ibge, cidade: ibge ? cidade : '',
    }
  } catch {
    return { erro: 'Consulta de CEP indisponível agora. Preencha manualmente.' }
  } finally {
    clearTimeout(t)
  }
}

export function enderecoDaReceita(r: DadosReceita): Endereco {
  return {
    cep: r.cep ? mascaraCep(r.cep) : '',
    logradouro: r.logradouro ? titulo(r.logradouro) : '',
    numero: r.numero ?? '',
    complemento: r.complemento ? titulo(r.complemento) : '',
    bairro: r.bairro ? titulo(r.bairro) : '',
    uf: r.uf ?? ufDoIbge(r.cidadeIbge) ?? '',
    cidade_ibge: r.cidadeIbge ?? '',
    cidade: r.municipio ? titulo(r.municipio) : '',
  }
}

// "Rua X, 27 - Sala 102 - Bairro · Salvador - BA" (mesma montagem do banco)
export function textoEndereco(e: Endereco): string {
  const rua = [e.logradouro.trim(), e.numero.trim()].filter(Boolean).join(', ')
  const linha = [rua, e.complemento.trim(), e.bairro.trim()].filter(Boolean).join(' - ')
  const cidade = e.cidade_ibge ? `${e.cidade} - ${e.uf}` : ''
  return [linha, cidade].filter(Boolean).join(' · ')
}
