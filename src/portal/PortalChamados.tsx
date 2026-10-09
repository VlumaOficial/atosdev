import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Loader2, Users2, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataBR, type ListaChamados } from '@/lib/portalChamados'
import { usePortal } from './PortalContext'
import PortalPagina from './PortalPagina'
import StatusChamado from './StatusChamado'
import { cn } from '@/lib/utils'

// Meus chamados: abertos, resolvidos e todos — os meus, os da minha equipe e (Supervisor) os do cliente
const ABAS = [['abertos', 'Abertos'], ['resolvidos', 'Resolvidos'], ['todos', 'Todos']] as const
const TAM = 15

export default function PortalChamados() {
  return <PortalPagina largo>{() => <Lista />}</PortalPagina>
}

function Lista() {
  const { id, base } = usePortal()
  const [aba, setAba] = useState<'abertos' | 'resolvidos' | 'todos'>('abertos')
  const [busca, setBusca] = useState('')
  const [q, setQ] = useState('')
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState<ListaChamados | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => { const t = setTimeout(() => { setQ(busca.trim()); setPagina(1) }, 350); return () => clearTimeout(t) }, [busca])
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('portal_listar_chamados', { p_tenant: id.tenant_id, p_situacao: aba, p_busca: q || null, p_pagina: pagina, p_tamanho: TAM })
    if (error) setErro('Não foi possível carregar os chamados.'); else { setErro(''); setDados(data as ListaChamados) }
  }, [id.tenant_id, aba, q, pagina])
  useEffect(() => { setDados(null); carregar() }, [carregar])

  const paginas = dados ? Math.max(1, Math.ceil(dados.total / TAM)) : 1
  return (
    <div data-testid="portal-chamados">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-foreground">Chamados</h1>
        <Link to={`${base}/abrir`} data-testid="abrir-chamado" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"><Plus size={15} /> Abrir chamado</Link>
      </div>
      <div className="flex gap-1 border-b border-border mb-3" role="tablist">
        {ABAS.map(([k, r]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => { setAba(k); setPagina(1) }} data-aba={k}
            className={cn('px-3 py-2 text-sm -mb-px border-b-2', aba === k ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {r}{dados?.contagens ? ` (${k === 'abertos' ? dados.contagens.abertos : k === 'todos' ? dados.contagens.todos : dados.contagens.todos - dados.contagens.abertos})` : ''}
          </button>
        ))}
      </div>
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input aria-label="Buscar chamados" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número ou título…"
          className="w-full pl-9 pr-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      {erro ? <p className="text-sm text-red-400">{erro}</p> : !dados ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div> : dados.itens.length === 0 ? (
        <div className="vluma-card p-8 text-center" data-testid="sem-chamados">
          <p className="text-sm text-foreground font-medium">{q ? 'Nenhum chamado encontrado.' : aba === 'abertos' ? 'Nenhum chamado aberto.' : 'Nada por aqui.'}</p>
          <p className="text-xs text-muted-foreground mt-1">Precisa de ajuda? Abra um chamado.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2" data-testid="lista-chamados">
            {dados.itens.map(c => (
              <li key={c.id}>
                <Link to={`${base}/chamados/${c.id}`} data-chamado={c.numero} className="vluma-card p-4 block hover:border-primary/40 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-primary">{c.numero}</span>
                    <StatusChamado status={c.status} />
                  </div>
                  <p className="text-sm font-medium text-foreground mt-1">{c.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.categoria ?? '—'}{c.unidade ? ` · ${c.unidade}` : ''} · {dataBR(c.criado_em)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1.5">
                    {c.meu ? 'Aberto por você' : <><Users2 size={11} /> {c.solicitante ?? 'da sua equipe'}</>}{c.afetados > 1 ? ` · ${c.afetados} pessoas afetadas` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="inline-flex items-center gap-1 disabled:opacity-40"><ChevronLeft size={15} /> Anterior</button>
              <span>Página {pagina} de {paginas}</span>
              <button disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)} className="inline-flex items-center gap-1 disabled:opacity-40">Próxima <ChevronRight size={15} /></button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
