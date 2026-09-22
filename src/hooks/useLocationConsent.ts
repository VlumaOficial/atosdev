import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// Consentimento LGPD de uso de localização, guardado em users.preferences
// (mesmo padrão de useViewPreference.ts). GPS só é lido sob demanda, no
// momento da foto — este hook só controla se o aviso já foi aceito.
export function useLocationConsent() {
  const { user } = useAuth()
  const [aceito, setAceito] = useState(false)
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
      if (active && data?.preferences?.location_consent_at) {
        setAceito(true)
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
      p_preferences: { ...prefs, location_consent_at: new Date().toISOString() },
    })
  }, [user])

  return { aceito, loaded, aceitar }
}
