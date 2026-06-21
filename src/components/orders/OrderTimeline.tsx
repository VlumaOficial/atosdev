import { useOrderEvents } from '@/hooks/useOrderEvents'
import { Clock, Play, Pause, RotateCcw, Calendar, CheckCircle2, XCircle, RefreshCw, UserCheck, PlusCircle } from 'lucide-react'

function fmt(dt: string): string {
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const EVENT_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  created: { label: 'Criada', icon: PlusCircle, color: 'text-blue-400' },
  scheduled: { label: 'Agendada', icon: Calendar, color: 'text-purple-400' },
  started: { label: 'Iniciada', icon: Play, color: 'text-amber-400' },
  paused: { label: 'Pausada', icon: Pause, color: 'text-orange-400' },
  resumed: { label: 'Retomada', icon: RotateCcw, color: 'text-amber-400' },
  completed: { label: 'Concluída', icon: CheckCircle2, color: 'text-green-400' },
  cancelled: { label: 'Cancelada', icon: XCircle, color: 'text-red-400' },
  reopened: { label: 'Reaberta', icon: RefreshCw, color: 'text-blue-400' },
  transferred: { label: 'Transferida', icon: UserCheck, color: 'text-cyan-400' },
}

const OCULTOS = new Set(['edited'])

export default function OrderTimeline({ orderId }: { orderId: string }) {
  const { events, loading } = useOrderEvents(orderId)

  const visiveis = events.filter(e => !OCULTOS.has(e.event_type))

  if (loading) {
    return <p className="text-xs text-muted-foreground">Carregando histórico...</p>
  }
  if (visiveis.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum evento registrado ainda.</p>
  }

  return (
    <div className="space-y-3">
      {visiveis.map(e => {
        const cfg = EVENT_CONFIG[e.event_type] ?? { label: e.event_type, icon: Clock, color: 'text-muted-foreground' }
        const Icon = cfg.icon
        const d = e.details || {}
        return (
          <div key={e.id} className="flex items-start gap-2.5">
            <Icon size={16} className={cfg.color + ' mt-0.5 flex-shrink-0'} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{cfg.label}</span>
                <span className="text-xs text-muted-foreground">{fmt(e.created_at)}</span>
              </div>
              {e.actor_name && <p className="text-xs text-muted-foreground">por {e.actor_name}</p>}
              {e.event_type === 'scheduled' && d.scheduled_at && (
                <p className="text-xs text-foreground mt-0.5">Para: {fmt(d.scheduled_at)}</p>
              )}
              {d.reason && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">Motivo: {String(d.reason).trim()}</p>}
              {e.event_type === 'completed' && d.completion_notes && (
                <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">Relato: {String(d.completion_notes).trim()}</p>
              )}
              {e.event_type === 'transferred' && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {d.from_technician_name ? `De ${d.from_technician_name}` : 'Atribuída'} para novo técnico
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
