import { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Loader2, SearchX } from 'lucide-react'
import { resolverPortal, basePortal, hostEhPortal, urlLogoPortal, temaDaCor, type PortalIdentidade } from '@/lib/portal'
import { PortalContext, type PortalCtx } from './PortalContext'
import { PortalEntrar, PortalEsqueciSenha, PortalRedefinirSenha } from './PortalAuthPages'
import PortalTermoPage from './PortalTermoPage'
import PortalInicio from './PortalInicio'
import PortalConvite from './PortalConvite'
import PortalSolicitarAcesso from './PortalSolicitarAcesso'
import PortalGestao from './PortalGestao'
import PortalAbrir from './PortalAbrir'
import PortalChamados from './PortalChamados'
import PortalChamado from './PortalChamado'
import PortalPreferencias from './PortalPreferencias'

// Portal de atendimento (Etapa 1). Montado:
//   * na raiz, quando o site é aberto por um host de portal (hostEhPortal)
//   * em /portal/:slug/*, no domínio do painel (teste e contingência)
export default function PortalApp() {
  const { slug, '*': resto } = useParams()
  const [id, setId] = useState<PortalIdentidade | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let vivo = true
    resolverPortal(slug).then(r => {
      if (!vivo) return
      if (r.redirecionar) {
        // nome curto antigo: leva para o novo mantendo o resto do caminho
        const resto = window.location.pathname.split('/').slice(3).join('/')
        window.location.replace(`/portal/${r.redirecionar}${resto ? '/' + resto : ''}${window.location.search}${window.location.hash}`)
        return
      }
      setId(r)
    }).catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [slug])

  const ctx = useMemo<PortalCtx | null>(() => {
    if (!id?.disponivel || !id.tenant_id) return null
    return {
      id: id as PortalCtx['id'],
      base: basePortal(id.slug),
      logo: urlLogoPortal(id.tenant_id, id.logo_versao),
    }
  }, [id])

  useEffect(() => {
    if (ctx) document.title = ctx.id.nome
    return () => { document.title = 'ATOS — Gestão de Campo' }
  }, [ctx])

  // O cliente do cliente só entra pelo endereço oficial do portal. O caminho
  // /portal/<nome> (e um endereço antigo, depois de trocar o nome curto) levam
  // até lá; só a equipe interna da empresa pode usar o caminho como prévia.
  const destinoOficial = useMemo(() => {
    if (!id?.disponivel || !id.host_oficial) return null
    const naHost = hostEhPortal()
    if (naHost && window.location.hostname === id.host_oficial) return null
    if (!naHost && id.interno) return null
    const caminho = naHost ? window.location.pathname : '/' + (resto ?? '')
    return `https://${id.host_oficial}${caminho}${window.location.search}${window.location.hash}`
  }, [id, resto])
  useEffect(() => { if (destinoOficial) window.location.replace(destinoOficial) }, [destinoOficial])

  if (destinoOficial) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
  if (erro) return <Aviso titulo="Não foi possível abrir o portal" texto="Verifique sua conexão e tente de novo." />
  if (!id) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
  if (!ctx) return <Aviso titulo="Portal não encontrado" texto="Confira o endereço com a empresa que atende você." />

  return (
    <PortalContext.Provider value={ctx}>
      <div style={temaDaCor(ctx.id.cor)} className="min-h-screen" data-portal={ctx.id.slug}>
        <Routes>
          <Route index element={<PortalInicio />} />
          <Route path="entrar" element={<PortalEntrar />} />
          <Route path="esqueci-senha" element={<PortalEsqueciSenha />} />
          <Route path="redefinir-senha" element={<PortalRedefinirSenha />} />
          <Route path="termos/:tipo" element={<PortalTermoPage />} />
          <Route path="convite/:token" element={<PortalConvite />} />
          <Route path="solicitar-acesso" element={<PortalSolicitarAcesso />} />
          <Route path="usuarios" element={<PortalGestao />} />
          <Route path="abrir" element={<PortalAbrir />} />
          <Route path="chamados" element={<PortalChamados />} />
          <Route path="chamados/:id" element={<PortalChamado />} />
          <Route path="preferencias" element={<PortalPreferencias />} />
          <Route path="*" element={<Navigate to={ctx.base || '/'} replace />} />
        </Routes>
      </div>
    </PortalContext.Provider>
  )
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" data-testid="portal-indisponivel">
      <div className="text-center max-w-sm">
        <SearchX size={32} className="text-muted-foreground mx-auto mb-3" />
        <h1 className="text-lg font-bold">{titulo}</h1>
        <p className="text-sm text-muted-foreground mt-2">{texto}</p>
      </div>
    </div>
  )
}
