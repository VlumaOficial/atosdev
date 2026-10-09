import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { PortalContexto } from '@/lib/portal'
import GestaoPortalCliente from '@/components/portal/GestaoPortalCliente'
import { usePortal } from './PortalContext'
import { RodapePortal } from './PortalLayout'
import { Topo } from './PortalInicio'

// Área do Supervisor: pessoas, convites, equipes e pedidos de acesso do(s) seu(s) cliente(s).
export default function PortalGestao() {
  const { id, base } = usePortal()
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [ctx, setCtx] = useState<PortalContexto | null>(null)
  const [cliente, setCliente] = useState('')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSessao(data.session)) }, [])
  useEffect(() => {
    if (!sessao) return
    supabase.rpc('portal_meu_contexto', { p_tenant: id.tenant_id }).then(({ data }) => {
      const c = data as PortalContexto; setCtx(c)
      const sup = (c.vinculos ?? []).filter(v => v.perfil === 'supervisor')
      if (sup.length) setCliente(sup[0].client_id)
    })
  }, [sessao, id.tenant_id])

  if (sessao === undefined || (sessao && !ctx)) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
  if (!sessao) return <Navigate to={`${base}/entrar`} replace />
  const supervisor = (ctx?.vinculos ?? []).filter(v => v.perfil === 'supervisor')
  return (
    <div className="min-h-screen">
      <Topo />
      <main className="max-w-3xl mx-auto px-4 py-6" data-testid="portal-gestao">
        <Link to={base || '/'} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"><ArrowLeft size={14} /> Início</Link>
        <h1 className="text-xl font-bold text-foreground">Usuários e equipes</h1>
        {supervisor.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3" data-testid="gestao-sem-acesso">Esta área é dos Supervisores do cliente. Se você precisa dela, fale com o Supervisor da sua empresa.</p>
        ) : (
          <>
            {supervisor.length > 1 && (
              <div className="mt-3">
                <label htmlFor="g-cliente" className="text-xs text-muted-foreground">Cliente</label>
                <select id="g-cliente" value={cliente} onChange={e => setCliente(e.target.value)} className="block mt-1 px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground">
                  {supervisor.map(v => <option key={v.client_id} value={v.client_id}>{v.cliente}</option>)}
                </select>
              </div>
            )}
            <p className="text-sm text-muted-foreground mt-1 mb-5">{supervisor.find(v => v.client_id === cliente)?.cliente}</p>
            {cliente && <GestaoPortalCliente clientId={cliente} eu={sessao.user.id} />}
          </>
        )}
      </main>
      <RodapePortal />
    </div>
  )
}
