import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { PortalContexto } from '@/lib/portal'
import { usePortal } from './PortalContext'
import { RodapePortal } from './PortalLayout'
import { Topo } from './PortalInicio'

// Casca das páginas internas do portal: exige login, acesso a este portal e os
// termos obrigatórios aceitos (senão volta ao início, que pede o aceite).
export default function PortalPagina({ children, largo = false }: { children: (ctx: PortalContexto, sessao: Session) => React.ReactNode; largo?: boolean }) {
  const { id, base } = usePortal()
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [ctx, setCtx] = useState<PortalContexto | null>(null)
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSessao(data.session)) }, [])
  useEffect(() => {
    if (!sessao) return
    supabase.rpc('portal_meu_contexto', { p_tenant: id.tenant_id }).then(({ data }) => setCtx(data as PortalContexto))
  }, [sessao, id.tenant_id])

  if (sessao === undefined || (sessao && !ctx)) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
  if (!sessao) return <Navigate to={`${base}/entrar`} replace />
  if (!ctx?.acesso || (ctx.termos_pendentes?.length ?? 0) > 0) return <Navigate to={base || '/'} replace />
  return (
    <div className="min-h-screen flex flex-col">
      <Topo />
      <main className={(largo ? 'max-w-3xl' : 'max-w-2xl') + ' w-full flex-1 mx-auto px-4 py-6'}>{children(ctx, sessao)}</main>
      <RodapePortal />
    </div>
  )
}
