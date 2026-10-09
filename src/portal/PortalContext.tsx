import { createContext, useContext } from 'react'
import type { PortalIdentidade } from '@/lib/portal'

// Identidade do portal aberto + base das rotas ('' no host próprio,
// '/portal/<nome curto>' no caminho interno)
export interface PortalCtx {
  id: PortalIdentidade & { tenant_id: string; slug: string; nome: string; empresa: string }
  base: string
  logo: string | null
}

export const PortalContext = createContext<PortalCtx | null>(null)

export function usePortal(): PortalCtx {
  const c = useContext(PortalContext)
  if (!c) throw new Error('usePortal fora do PortalApp')
  return c
}
