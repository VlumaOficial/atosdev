import { useEffect, useRef } from 'react'

// Anti-robô da Cloudflare (Turnstile). Só aparece quando a VLUMA configurou a chave
// pública (Super Admin › Configurações › Plataforma — portal de atendimento).
declare global { interface Window { turnstile?: any; __onTurnstileLoad?: () => void } }

export default function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let id: string | undefined
    function montar() {
      if (!ref.current || !window.turnstile) return
      id = window.turnstile.render(ref.current, { sitekey: siteKey, callback: (t: string) => onToken(t), 'expired-callback': () => onToken(''), theme: 'auto' })
    }
    if (window.turnstile) montar()
    else {
      window.__onTurnstileLoad = montar
      if (!document.getElementById('cf-turnstile-js')) {
        const s = document.createElement('script')
        s.id = 'cf-turnstile-js'; s.async = true; s.defer = true
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__onTurnstileLoad'
        document.head.appendChild(s)
      }
    }
    return () => { try { if (id && window.turnstile) window.turnstile.remove(id) } catch { /* já removido */ } }
  }, [siteKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} data-testid="turnstile" />
}
