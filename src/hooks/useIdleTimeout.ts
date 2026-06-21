import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'

// Logout automático por inatividade.
// Robusto a abas em segundo plano: usa timestamp da última interação
// e checa periodicamente + ao reganhar o foco (não depende só de setTimeout,
// que os navegadores pausam em abas inativas).
export function useIdleTimeout(minutes: number = 30) {
  const { user, signOut } = useAuth()
  const lastActivityRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!user) return

    const limiteMs = minutes * 60 * 1000

    function registrarAtividade() {
      lastActivityRef.current = Date.now()
    }

    function checarInatividade() {
      const decorrido = Date.now() - lastActivityRef.current
      if (decorrido >= limiteMs) {
        signOut()
      }
    }

    const eventos: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'mousemove']
    eventos.forEach(ev => window.addEventListener(ev, registrarAtividade, { passive: true }))

    // checagem periódica (a cada 15s)
    const intervalo = setInterval(checarInatividade, 15 * 1000)

    // ao voltar o foco / aba visível, checa imediatamente
    function onVisibilidade() {
      if (document.visibilityState === 'visible') checarInatividade()
    }
    document.addEventListener('visibilitychange', onVisibilidade)
    window.addEventListener('focus', checarInatividade)

    // marca atividade inicial
    registrarAtividade()

    return () => {
      eventos.forEach(ev => window.removeEventListener(ev, registrarAtividade))
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', onVisibilidade)
      window.removeEventListener('focus', checarInatividade)
    }
  }, [user, minutes, signOut])
}
