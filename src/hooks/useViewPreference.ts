import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export type ViewMode = 'table' | 'cards'

export function useViewPreference(key: string, defaultMode: ViewMode = 'table') {
  const { user } = useAuth()
  const [mode, setMode] = useState<ViewMode>(defaultMode)
  const [loaded, setLoaded] = useState(false)

  // Carrega a preferência salva no banco
  useEffect(() => {
    let active = true
    async function load() {
      if (!user) { setLoaded(true); return }
      const { data } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', user.id)
        .single()
      if (active && data?.preferences?.views?.[key]) {
        setMode(data.preferences.views[key] as ViewMode)
      }
      if (active) setLoaded(true)
    }
    load()
    return () => { active = false }
  }, [user, key])

  // Salva a preferência no banco
  const updateMode = useCallback(async (newMode: ViewMode) => {
    setMode(newMode)
    if (!user) return
    const { data } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', user.id)
      .single()
    const prefs = data?.preferences ?? {}
    const views = { ...(prefs.views ?? {}), [key]: newMode }
    await supabase
      .from('users')
      .update({ preferences: { ...prefs, views } })
      .eq('id', user.id)
  }, [user, key])

  return { mode, setMode: updateMode, loaded }
}
