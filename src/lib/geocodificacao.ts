import type { Coordenadas } from '@/lib/geolocation'

// Geocodificação reversa (coordenada → endereço legível) para o carimbo.
//
// Provedor ATUAL: Nominatim público (OpenStreetMap), chamado direto do
// navegador — só para o DEV/MVP (decisão de 2026-09-23). O provedor de
// produção/SaaS ainda será discutido (volume, custo por tenant, cota,
// cache, LGPD); quando for um provedor pago, esta função passa a chamar
// uma Edge Function (a chave não pode ficar no navegador). Todo o resto
// do app só conhece `obterEndereco`, então a troca fica restrita a este
// arquivo.
//
// Nunca bloqueia a foto: sem internet, timeout ou erro → null, e o
// carimbo sai só com as coordenadas.

const TIMEOUT_MS = 5000
const INTERVALO_MIN_MS = 1100 // política do Nominatim público: máx. 1 req/s

const cache = new Map<string, string | null>()
let ultimaChamada = 0

function chaveCache(c: Coordenadas) {
  // ~11 m — fotos seguidas no mesmo local reaproveitam o endereço
  return `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`
}

// Monta no formato brasileiro: "Rua X - Bairro, Cidade - UF, CEP".
// Nome do local (POI) e número NÃO entram: o Nominatim costuma pegar o
// ponto cadastrado mais próximo (em teste real devolveu o colégio vizinho
// e o número errado). Numa foto de prova, endereço errado é pior que
// incompleto — a coordenada logo abaixo continua sendo a prova exata.
function formatar(a: Record<string, string>): string | null {
  const rua = a.road ?? a.pedestrian ?? a.footway
  const bairro = a.suburb ?? a.neighbourhood ?? a.quarter
  const cidade = a.city ?? a.town ?? a.village ?? a.municipality
  const uf = (a['ISO3166-2-lvl4'] ?? '').replace(/^BR-/, '') || a.state
  const cep = a.postcode

  const parte1 = [rua, bairro].filter(Boolean).join(' - ')
  const parte2 = [cidade, uf].filter(Boolean).join(' - ')
  const texto = [parte1, parte2].filter(Boolean).join(', ') + (cep ? `, ${cep}` : '')
  return texto.trim() || null
}

export async function obterEndereco(coords: Coordenadas): Promise<string | null> {
  const chave = chaveCache(coords)
  if (cache.has(chave)) return cache.get(chave) ?? null

  const espera = ultimaChamada + INTERVALO_MIN_MS - Date.now()
  if (espera > 0) await new Promise(r => setTimeout(r, espera))
  ultimaChamada = Date.now()

  const controle = new AbortController()
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS)
  try {
    const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=pt-BR'
      + `&lat=${coords.lat}&lon=${coords.lng}`
    const resp = await fetch(url, { signal: controle.signal })
    if (!resp.ok) return null
    const json = await resp.json()
    const endereco = json?.address ? formatar(json.address) : null
    cache.set(chave, endereco)
    return endereco
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
