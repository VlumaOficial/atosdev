import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMyOrders } from '@/hooks/useMyOrders'
import type { Order } from '@/hooks/useOrders'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ClipboardList, Building2, MapPin, ChevronRight, AlertTriangle } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  aberta: 'Aberta', agendada: 'Agendada', em_andamento: 'Em andamento',
  pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada',
}
const STATUS_STYLES: Record<string, string> = {
  aberta: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  agendada: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  em_andamento: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  pausada: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  concluida: 'text-green-400 bg-green-500/10 border-green-500/30',
  cancelada: 'text-muted-foreground bg-secondary border-border',
}
const PRIORITY_RANK: Record<string, number> = { urgente: 0, alta: 1, normal: 2 }
const PRIORITY_LABELS: Record<string, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' }

const GROUPS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'andamento', label: 'Em andamento', statuses: ['em_andamento', 'pausada'] },
  { key: 'proximas', label: 'Próximas', statuses: ['agendada', 'aberta'] },
  { key: 'finalizadas', label: 'Finalizadas', statuses: ['concluida', 'cancelada'] },
]

export default function MyOrdersPage() {
  const navigate = useNavigate()
  const { orders, loading, error } = useMyOrders()

  const grouped = useMemo(() => {
    return GROUPS.map(g => {
      const items = orders
        .filter(o => g.statuses.includes(o.status))
        .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))
      return { ...g, items }
    }).filter(g => g.items.length > 0)
  }, [orders])

  function OrderCard({ o }: { o: Order }) {
    return (
      <button
        onClick={() => navigate(`/campo/os/${o.id}`)}
        className="w-full text-left bg-card border border-border rounded-xl p-4 active:bg-secondary/40 transition"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-primary">{o.number}</span>
            {o.priority !== 'normal' && (
              <span className={'inline-flex items-center gap-1 text-xs font-medium ' + (o.priority === 'urgente' ? 'text-red-400' : 'text-amber-400')}>
                <AlertTriangle size={11} /> {PRIORITY_LABELS[o.priority]}
              </span>
            )}
          </div>
          <span className={'inline-block px-2 py-0.5 rounded-md text-xs font-medium border ' + STATUS_STYLES[o.status]}>
            {STATUS_LABELS[o.status]}
          </span>
        </div>
        <p className="font-medium text-foreground mb-2">{o.title}</p>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5"><Building2 size={12} /> {o.client?.name ?? '—'}</p>
          {o.location?.name && <p className="flex items-center gap-1.5"><MapPin size={12} /> {o.location.name}</p>}
        </div>
        <div className="flex items-center justify-end mt-2 text-primary text-xs">
          Ver atendimento <ChevronRight size={14} />
        </div>
      </button>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Meus atendimentos</h1>
        <p className="text-sm text-muted-foreground">Ordens de serviço atribuídas a você</p>
      </div>

      {error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Nenhum atendimento"
            description="Você não tem ordens de serviço atribuídas no momento."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(g => (
            <div key={g.key}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">{g.label} ({g.items.length})</p>
              <div className="space-y-3">
                {g.items.map(o => <OrderCard key={o.id} o={o} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
