import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'

// Faz logout automático após X minutos sem interação do usuário
export function useIdleTimeout(minutes: number = 30) {
  const { user, signOut } = useAuth()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!user) return

    const limite = minutes * 60 * 1000

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        signOut()
      }, limite)
    }

    const eventos: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'mousemove']
    eventos.forEach(ev => window.addEventListener(ev, reset, { passive: true }))

    reset() // inicia o timer

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      eventos.forEach(ev => window.removeEventListener(ev, reset))
    }
  }, [user, minutes, signOut])
}
