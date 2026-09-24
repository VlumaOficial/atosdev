import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { haTrabalhoPendente } from '@/lib/trabalhoPendente'

// Mantém o app na versão mais recente SEM incomodar ninguém (decisão de
// UX 2026-09-24: a faixa "Nova versão — Atualizar" foi considerada
// péssima — técnico no campo não deve tomar decisão técnica).
//
// Um app de página única roda o código de quando a aba foi carregada;
// técnico que deixa o ATOS aberto por dias ficaria sem correções (achado
// 2026-09-23). Então: checa /version.json ao sair/voltar da aba e a cada
// 5 min; havendo versão nova, recarrega em SILÊNCIO no primeiro momento
// seguro:
//  - app em segundo plano (celular bloqueado / outro app) e sem trabalho
//    pendente → recarrega escondido; ao voltar já está na versão nova,
//    na mesma tela (rota + foto aberta ficam na URL)
//  - ou na próxima troca de tela (sem trabalho pendente)
// Nunca recarrega com formulário/checklist/câmera/upload em andamento.

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
  const pendente = useRef(false)
  const location = useLocation()
  const primeiraRota = useRef(true)

  useEffect(() => {
    let ativo = true
    const tentarAplicar = () => {
      if (pendente.current && document.visibilityState === 'hidden' && !haTrabalhoPendente()) window.location.reload()
    }
    async function checar() {
      const publicado = await buildPublicado()
      if (ativo && publicado && publicado !== __BUILD_ID__) {
        pendente.current = true
        tentarAplicar()
      }
    }
    checar()
    const timer = setInterval(checar, INTERVALO_MS)
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'hidden') { tentarAplicar(); if (!pendente.current) checar() }
      else checar()
    }
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    return () => {
      ativo = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    }
  }, [])

  // troca de tela com versão nova pendente → recarrega já no destino
  useEffect(() => {
    if (primeiraRota.current) { primeiraRota.current = false; return }
    if (pendente.current && !haTrabalhoPendente()) window.location.reload()
  }, [location.pathname])

  return null
}
