import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataBR, type ListaChamados } from '@/lib/portalChamados'
import { usePortal } from './PortalContext'
import StatusChamado from './StatusChamado'

// Início do portal: o botão de abrir chamado, os contadores e os chamados recentes
export default function ResumoChamados() {
  const { id, base } = usePortal()
  const [d, setD] = useState<ListaChamados | null>(null)
  useEffect(() => {
    supabase.rpc('portal_listar_chamados', { p_tenant: id.tenant_id, p_situacao: 'abertos', p_busca: null, p_pagina: 1, p_tamanho: 5 }).then(({ data }) => setD(data as ListaChamados))
  }, [id.tenant_id])
  const c = d?.contagens
  return (
    <section className="mt-6" data-testid="resumo-chamados">
      <Link to={`${base}/abrir`} data-testid="inicio-abrir"
        className="w-full py-3.5 rounded-lg bg-primary text-primary-foreground text-base font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90"><Plus size={18} /> Abrir chamado</Link>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <Link to={`${base}/chamados`} className="vluma-card p-4 hover:border-primary/40 transition" data-contador="abertos">
          <p className="text-2xl font-semibold text-foreground tabular-nums">{c ? c.abertos : '–'}</p><p className="text-xs text-muted-foreground mt-0.5">Chamados abertos</p>
        </Link>
        <div className="vluma-card p-4" data-contador="resolvidos">
          <p className="text-2xl font-semibold text-foreground tabular-nums">{c ? c.resolvidos_mes : '–'}</p><p className="text-xs text-muted-foreground mt-0.5">Resolvidos neste mês</p>
        </div>
      </div>
      {d && d.itens.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-foreground">Em andamento</p>
            <Link to={`${base}/chamados`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">Ver todos <ArrowRight size={12} /></Link>
          </div>
          <ul className="space-y-2" data-testid="chamados-recentes">
            {d.itens.map(i => (
              <li key={i.id}>
                <Link to={`${base}/chamados/${i.id}`} className="vluma-card p-3.5 block hover:border-primary/40 transition" data-chamado={i.numero}>
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-mono text-primary">{i.numero}</span><StatusChamado status={i.status} /></div>
                  <p className="text-sm text-foreground mt-1">{i.titulo}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{dataBR(i.criado_em)}{i.unidade ? ` · ${i.unidade}` : ''}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
