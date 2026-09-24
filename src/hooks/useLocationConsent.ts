import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// Consentimento LGPD de uso de localização, guardado em users.preferences
// (mesmo padrão de useViewPreference.ts). GPS só é lido sob demanda, no
// momento da foto — este hook só controla se o aviso já foi aceito.
//
// O aceite é VERSIONADO: quando o texto do termo muda de forma relevante,
// sobe VERSAO_TERMO_LOCALIZACAO e quem aceitou uma versão anterior vê o
// termo de novo (com aviso de atualização). Aceites antigos, sem versão
// gravada, contam como versão 1.
//   v1 — GPS sob demanda, carimbado só na foto (F6 Bloco B)
//   v2 (2026-09-23) — coordenada também enviada ao OpenStreetMap para
//        virar endereço no carimbo
//   v3 (2026-09-24) — endereço passa a vir de um provedor de mapas
//        contratado pela plataforma (hoje Nominatim; pode ser LocationIQ/
//        OpenCage), via servidor do ATOS. Texto genérico de propósito:
//        trocar de provedor no futuro não exige novo aceite
export const VERSAO_TERMO_LOCALIZACAO = 3

export function useLocationConsent() {
  const { user } = useAuth()
  const [aceito, setAceito] = useState(false)
  const [termoAtualizado, setTermoAtualizado] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!user) { setLoaded(true); return }
      const { data } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', user.id)
        .single()
      const prefs = data?.preferences
      if (active && prefs?.location_consent_at) {
        const versao = Number(prefs.location_consent_version ?? 1)
        if (versao >= VERSAO_TERMO_LOCALIZACAO) setAceito(true)
        else setTermoAtualizado(true)
      }
      if (active) setLoaded(true)
    }
    load()
    return () => { active = false }
  }, [user])

  const aceitar = useCallback(async () => {
    setAceito(true)
    if (!user) return
    const { data } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', user.id)
      .single()
    const prefs = data?.preferences ?? {}
    await supabase.rpc('atualizar_minhas_preferencias', {
      p_preferences: { ...prefs, location_consent_at: new Date().toISOString(), location_consent_version: VERSAO_TERMO_LOCALIZACAO },
    })
  }, [user])

  return { aceito, termoAtualizado, loaded, aceitar }
}
