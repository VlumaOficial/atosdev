import { supabase } from '@/lib/supabase'
import type { Coordenadas } from '@/lib/geolocation'

// Coordenada → endereço para o carimbo, via Edge Function "geocodificar"
// (serviço da plataforma, 2026-09-24). O provedor (Nominatim/LocationIQ/
// OpenCage), a chave, o cache compartilhado e a medição de consumo por
// empresa ficam no servidor — o Super Admin troca o provedor pela tela,
// sem deploy, e DEV/PRD usam o mesmo provedor.
//
// Nunca bloqueia a foto: sem internet, timeout ou erro → null, e o
// carimbo sai só com as coordenadas.

const TIMEOUT_MS = 7000
// sem cache aqui de propósito: o cache é do servidor (compartilhado e
// sem custo) e toda foto passa por ele — o consumo por empresa fica exato

export async function obterEndereco(coords: Coordenadas): Promise<string | null> {
  try {
    const resposta = await Promise.race([
      supabase.functions.invoke('geocodificar', { body: { lat: coords.lat, lng: coords.lng } }),
      new Promise<null>(r => setTimeout(() => r(null), TIMEOUT_MS)),
    ])
    return (resposta as any)?.data?.endereco ?? null
  } catch {
    return null
  }
}
