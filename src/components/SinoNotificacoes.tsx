import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Bell, AlertTriangle, Clock, CheckCheck, ArrowRightLeft, UserPlus, Headset, MessageSquare, CalendarClock, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Avisos de SLA (migration 045) para admin/gestor: "em risco" e "vencido".
// Tempo real pela publicação do Supabase; tocar abre a OS e marca como lido.

interface Notificacao { id: string; tipo: 'sla_em_risco' | 'sla_vencido' | 'transferida' | 'pingue_pongue' | 'solicitacao_acesso' | 'novo_chamado_portal' | 'mensagem_cliente' | 'previsao_vencida' | 'reagendamento_pedido' | 'cancelamento_cliente' | 'reabertura_cliente'; order_id: string | null; link: string | null; titulo: string; corpo: string | null; criada_em: string; lida_em: string | null }

export function useNotificacoes() {
  const { user } = useAuth()
  const [itens, setItens] = useState<Notificacao[]>([])
  const ativo = user?.role === 'admin' || user?.role === 'gestor' || user?.role === 'atendente'
  const canal = useRef('notificacoes-' + Math.random().toString(36).slice(2))   // um canal por instância (menu desktop e celular)
  const recarregar = useCallback(async () => {
    if (!ativo) return
    const { data } = await supabase.from('notificacoes').select('id, tipo, order_id, link, titulo, corpo, criada_em, lida_em')
      .order('criada_em', { ascending: false }).limit(30)
    setItens((data ?? []) as Notificacao[])
  }, [ativo])
  useEffect(() => { recarregar() }, [recarregar])
  useEffect(() => {
    if (!ativo || !user) return
    const ch = supabase.channel(canal.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: 'user_id=eq.' + user.id }, () => recarregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [ativo, user, recarregar])
  const naoLidas = itens.filter(n => !n.lida_em).length
  async function marcar(ids?: string[]) {
    await supabase.rpc('marcar_notificacoes_lidas', { p_ids: ids ?? null })
    recarregar()
  }
  return { itens, naoLidas, marcar, ativo }
}

function quando(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 1440) return `há ${Math.floor(min / 60)} h`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function SinoNotificacoes({ onNavegar }: { onNavegar?: () => void }) {
  const { itens, naoLidas, marcar, ativo } = useNotificacoes()
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  if (!ativo) return null

  async function abrir(n: Notificacao) {
    if (!n.lida_em) await marcar([n.id])
    setAberto(false)
    onNavegar?.()
    if (n.tipo === 'solicitacao_acesso') navigate('/usuarios?aba=solicitacoes')
    else if (n.order_id) navigate('/os/' + n.order_id)
    else if (n.link) navigate(n.link)
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAberto(a => !a)} aria-label={`Avisos${naoLidas ? ` (${naoLidas} não lidos)` : ''}`} data-testid="sino"
        className="relative w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary">
        <Bell size={16} />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center" data-testid="sino-contador">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute left-0 top-9 z-50 w-80 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-lg shadow-xl" data-testid="sino-painel">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-sm font-medium text-foreground">Avisos</p>
            {naoLidas > 0 && (
              <button onClick={() => marcar()} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"><CheckCheck size={12} /> Marcar todos como lidos</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {itens.length === 0 && <p className="p-4 text-xs text-muted-foreground text-center">Nenhum aviso.</p>}
            {itens.map(n => (
              <button key={n.id} onClick={() => abrir(n)} data-aviso={n.titulo}
                className={cn('w-full text-left px-3 py-2.5 hover:bg-secondary/50 flex gap-2', !n.lida_em && 'bg-primary/5')}>
                {n.tipo === 'sla_vencido' || n.tipo === 'pingue_pongue'
                  ? <AlertTriangle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                  : n.tipo === 'transferida'
                    ? <ArrowRightLeft size={15} className="text-primary flex-shrink-0 mt-0.5" />
                    : n.tipo === 'solicitacao_acesso'
                      ? <UserPlus size={15} className="text-primary flex-shrink-0 mt-0.5" />
                      : n.tipo === 'novo_chamado_portal'
                        ? <Headset size={15} className="text-primary flex-shrink-0 mt-0.5" />
                        : n.tipo === 'mensagem_cliente'
                          ? <MessageSquare size={15} className="text-green-400 flex-shrink-0 mt-0.5" />
                          : n.tipo === 'previsao_vencida'
                            ? <Clock size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                            : n.tipo === 'reagendamento_pedido'
                              ? <CalendarClock size={15} className="text-purple-400 flex-shrink-0 mt-0.5" />
                              : n.tipo === 'cancelamento_cliente'
                                ? <XCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                                : n.tipo === 'reabertura_cliente'
                                  ? <AlertTriangle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                    : <Clock size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />}
                <span className="min-w-0">
                  <span className={cn('block text-xs', n.lida_em ? 'text-muted-foreground' : 'text-foreground font-medium')}>{n.titulo}</span>
                  {n.corpo && <span className="block text-[11px] text-muted-foreground">{n.corpo}</span>}
                  <span className="block text-[10px] text-muted-foreground mt-0.5">{quando(n.criada_em)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
