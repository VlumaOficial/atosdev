import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { PortalContexto } from '@/lib/portal'
import { usePortal } from './PortalContext'
import { cn } from '@/lib/utils'

// Navegação do portal (depois do login): Início · Chamados · Preferências · (Supervisor) Usuários e equipes
const cache: Record<string, PortalContexto> = {}

export function usePessoaPortal(): PortalContexto | null {
  const { id } = usePortal()
  const [ctx, setCtx] = useState<PortalContexto | null>(cache[id.tenant_id] ?? null)
  useEffect(() => {
    let vivo = true
    supabase.rpc('portal_meu_contexto', { p_tenant: id.tenant_id }).then(({ data }) => {
      if (!vivo || !data) return
      cache[id.tenant_id] = data as PortalContexto
      setCtx(data as PortalContexto)
    })
    return () => { vivo = false }
  }, [id.tenant_id])
  return ctx
}

export default function PortalNav() {
  const { base } = usePortal()
  const ctx = usePessoaPortal()
  const supervisor = (ctx?.vinculos ?? []).some(v => v.perfil === 'supervisor')
  const itens = [
    { to: base || '/', rotulo: 'Início', fim: true, id: 'inicio' },
    { to: `${base}/chamados`, rotulo: 'Chamados', id: 'chamados' },
    { to: `${base}/preferencias`, rotulo: 'Preferências', id: 'preferencias' },
    ...(supervisor ? [{ to: `${base}/usuarios`, rotulo: 'Usuários e equipes', id: 'usuarios' }] : []),
  ]
  return (
    <nav className="max-w-3xl mx-auto px-4 flex gap-1 overflow-x-auto" aria-label="Navegação do portal" data-testid="portal-nav">
      {itens.map(i => (
        <NavLink key={i.id} to={i.to} end={i.fim} data-nav={i.id}
          className={({ isActive }) => cn('px-3 py-2 text-sm whitespace-nowrap border-b-2 transition -mb-px', isActive ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {i.rotulo}
        </NavLink>
      ))}
    </nav>
  )
}
