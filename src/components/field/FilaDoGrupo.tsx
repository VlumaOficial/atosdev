import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hand, Building2, MapPin, AlertTriangle, Loader2, Users2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ROTULO_NIVEL } from '@/lib/sla'
import type { Order } from '@/hooks/useOrders'

// "Fila do grupo" no app do técnico (portal E2): só aparece para quem é membro
// de um grupo que liga o "Assumir" (padrão desligado). Mostra as OS do grupo
// que ainda estão sem técnico — nunca as de colegas. Para os demais técnicos
// a tela não muda nada.

const SELECT = '*, client:clients(id, name), location:locations(id, name), grupo:grupos_atendimento(id, nome, nivel)'

export default function FilaDoGrupo() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [temGrupoAssumir, setTemGrupoAssumir] = useState(false)
  const [fila, setFila] = useState<Order[]>([])
  const [assumindo, setAssumindo] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!user) return
    const { data: m } = await supabase.from('grupo_membros').select('grupo:grupos_atendimento(id, assumir, ativo)').eq('user_id', user.id)
    const tem = (m ?? []).some((x: any) => x.grupo?.assumir && x.grupo?.ativo)
    setTemGrupoAssumir(tem)
    if (!tem) { setFila([]); return }
    // a regra do banco só devolve as OS sem técnico dos grupos em que posso assumir
    const { data } = await supabase.from('orders').select(SELECT).is('technician_id', null)
      .in('status', ['aberta', 'agendada']).order('created_at', { ascending: false })
    setFila((data ?? []) as unknown as Order[])
  }, [user])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    if (!temGrupoAssumir) return
    const ch = supabase.channel('fila-grupo-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [temGrupoAssumir, carregar])

  async function assumir(o: Order) {
    setErro('')
    setAssumindo(o.id)
    const { error } = await supabase.rpc('assumir_os', { p_order: o.id })
    setAssumindo(null)
    if (error) { setErro(error.message); carregar(); return }
    navigate(`/campo/os/${o.id}`)
  }

  if (!temGrupoAssumir) return null
  return (
    <section className="mb-5" data-testid="fila-do-grupo">
      <div className="flex items-center gap-2 mb-2">
        <Users2 size={15} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Fila do grupo</h2>
        <span className="text-xs text-muted-foreground">{fila.length} {fila.length === 1 ? 'aguardando' : 'aguardando'}</span>
      </div>
      {erro && <p className="text-xs text-red-400 mb-2" role="alert">{erro}</p>}
      {fila.length === 0 ? (
        <p className="text-xs text-muted-foreground bg-card border border-border rounded-xl p-3">Nenhum atendimento esperando no seu grupo.</p>
      ) : (
        <div className="space-y-2">
          {fila.map(o => (
            <div key={o.id} className="bg-card border border-border rounded-xl p-3" data-fila-os={o.number}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-primary">{o.number}</span>
                <span className="text-[11px] text-muted-foreground">{o.grupo?.nome}</span>
              </div>
              <p className="font-medium text-foreground text-sm mt-0.5">{o.title}</p>
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5"><Building2 size={11} /> {o.client?.name ?? '—'}</p>
                {o.location?.name && <p className="flex items-center gap-1.5"><MapPin size={11} /> {o.location.name}</p>}
                {(o.priority === 'critico' || o.priority === 'alto') && (
                  <p className={'flex items-center gap-1.5 font-medium ' + (o.priority === 'critico' ? 'text-red-400' : 'text-amber-400')}><AlertTriangle size={11} /> {ROTULO_NIVEL[o.priority]}</p>
                )}
              </div>
              <button onClick={() => assumir(o)} disabled={assumindo === o.id} data-testid="assumir"
                className="mt-2 w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:opacity-80 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {assumindo === o.id ? <Loader2 size={14} className="animate-spin" /> : <Hand size={14} />} Assumir
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
