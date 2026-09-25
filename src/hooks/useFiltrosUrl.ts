import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

// Filtros de lista guardados no endereço (?sit=atrasado&cli=...): voltar
// da tela de detalhe mantém os filtros e o link pode ser compartilhado já
// filtrado (decisão de UX, 2026-09-25). Valor igual ao padrão sai da URL.

export function useFiltrosUrl<K extends string>(padroes: Record<K, string>) {
  const [params, setParams] = useSearchParams()

  const valores = useMemo(() => {
    const v = {} as Record<K, string>
    for (const k of Object.keys(padroes) as K[]) v[k] = params.get(k) ?? padroes[k]
    return v
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  // mudar um filtro volta para a página 1 (menos quando é a própria página)
  const definir = useCallback((mudancas: Partial<Record<K, string>>) => {
    setParams(atual => {
      const n = new URLSearchParams(atual)
      for (const [k, v] of Object.entries(mudancas) as [K, string][]) {
        if (!v || v === padroes[k]) n.delete(k)
        else n.set(k, v)
      }
      if (!('pag' in mudancas)) n.delete('pag')
      return n
    }, { replace: true })
  }, [setParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const limpar = useCallback((manter: K[] = []) => {
    setParams(atual => {
      const n = new URLSearchParams()
      for (const k of manter) { const v = atual.get(k); if (v) n.set(k, v) }
      return n
    }, { replace: true })
  }, [setParams])

  return { valores, definir, limpar }
}
