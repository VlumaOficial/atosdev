import { useSearchParams } from 'react-router-dom'

// Foto aberta em tela cheia fica no endereço (?foto=caminho). Assim, se o
// Android descartar a aba (memória) ou o app se atualizar em segundo
// plano, ao voltar a mesma foto reabre sozinha. Abrir EMPILHA no
// histórico — o botão "voltar" do celular fecha a foto em vez de sair da
// tela da OS.
export function useFotoAberta(path: string | null | undefined) {
  const [params, setParams] = useSearchParams()
  const aberta = !!path && params.get('foto') === path

  function abrir() {
    if (!path) return
    const novo = new URLSearchParams(params)
    novo.set('foto', path)
    setParams(novo, { state: { fotoEmpilhada: true } })
  }

  function fechar() {
    if ((window.history.state?.usr as any)?.fotoEmpilhada) {
      window.history.back()
    } else {
      const novo = new URLSearchParams(params)
      novo.delete('foto')
      setParams(novo, { replace: true })
    }
  }

  return { aberta, abrir, fechar }
}
