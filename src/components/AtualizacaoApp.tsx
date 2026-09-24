import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'

// Mantém o app na versão mais recente. Um app de página única continua
// rodando o código de quando a aba foi carregada — técnico que deixa o
// ATOS aberto por dias fica sem correções (achado em 2026-09-23: foto
// tirada numa aba antiga saiu sem código de verificação e sem miniatura).
//
// Checa /version.json ao voltar para a aba e a cada 5 min. Havendo
// versão nova: mostra a faixa "Atualizar" e recarrega sozinho na PRÓXIMA
// troca de tela (momento seguro — nunca no meio de um checklist ou
// formulário sendo preenchido, pra não perder o que foi digitado).

const INTERVALO_MS = 5 * 60 * 1000

async function buildPublicado(): Promise<string | null> {
  try {
    const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json())?.build ?? null
  } catch {
    return null   // sem internet: tenta de novo depois
  }
}

export default function AtualizacaoApp() {
  const [novaVersao, setNovaVersao] = useState(false)
  const location = useLocation()
  const primeiraRota = useRef(true)

  useEffect(() => {
    let ativo = true
    async function checar() {
      const publicado = await buildPublicado()
      if (ativo && publicado && publicado !== __BUILD_ID__) setNovaVersao(true)
    }
    checar()
    const timer = setInterval(checar, INTERVALO_MS)
    const aoVoltar = () => { if (document.visibilityState === 'visible') checar() }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => {
      ativo = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [])

  // troca de tela com versão nova pendente → recarrega já na tela de destino
  useEffect(() => {
    if (primeiraRota.current) { primeiraRota.current = false; return }
    if (novaVersao) window.location.reload()
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!novaVersao) return null
  return (
    <div role="status" data-testid="nova-versao"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 px-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-lg text-sm">
      <span>Nova versão do ATOS disponível</span>
      <button type="button" onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 font-medium">
        <RefreshCw size={13} /> Atualizar
      </button>
    </div>
  )
}
