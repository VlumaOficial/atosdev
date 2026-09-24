import { useEffect } from 'react'

// "Tem trabalho que se perderia num recarregamento?" — usado pela
// atualização silenciosa do app (AtualizacaoApp): só recarrega quando a
// resposta é NÃO. Três sinais, do mais explícito ao mais genérico:
//  1. registro explícito (useTrabalhoPendente): upload em andamento,
//     checklist com respostas não salvas etc.
//  2. qualquer janela/modal aberto (formulário, câmera, checklist) —
//     exceto os marcados com data-seguro-recarregar (ex.: visualizador
//     de foto, que reabre sozinho pela URL)
//  3. campo de texto com algo digitado e em foco (ex.: observação,
//     comentário a meio caminho)

let contador = 0

export function useTrabalhoPendente(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return
    contador++
    return () => { contador-- }
  }, [ativo])
}

export function haTrabalhoPendente(): boolean {
  if (contador > 0) return true
  const dialogos = Array.from(document.querySelectorAll('[role="dialog"]'))
  if (dialogos.some(d => !d.closest('[data-seguro-recarregar]'))) return true
  const foco = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
  if (foco && (foco.tagName === 'TEXTAREA' || (foco.tagName === 'INPUT' && foco.type !== 'file')) && foco.value) return true
  return false
}
