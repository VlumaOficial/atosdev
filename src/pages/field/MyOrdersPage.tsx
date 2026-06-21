import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMyOrders } from '@/hooks/useMyOrders'
import { useAuth } from '@/hooks/useAuth'
import type { Order } from '@/hooks/useOrders'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ClipboardList, Building2, MapPin, ChevronRight, AlertTriangle, List, LayoutGrid } from 'lucide-react'

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

const STATUS_CARDS: { key: string; label: string; dot: string }[] = [
  { key: 'aberta', label: 'Abertas', dot: 'bg-blue-400' },
  { key: 'em_andamento', label: 'Em andamento', dot: 'bg-amber-400' },
  { key: 'agendada', label: 'Agendadas', dot: 'bg-purple-400' },
  { key: 'pausada', label: 'Pausadas', dot: 'bg-orange-400' },
  { key: 'concluida', label: 'Concluídas', dot: 'bg-green-400' },
  { key: 'cancelada', label: 'Canceladas', dot: 'bg-muted-foreground' },
]

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function primeiroNome(nome?: string | null): string {
  if (!nome) return ''
  return nome.trim().split(' ')[0]
}

export default function MyOrdersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { orders, loading, error } = useMyOrders()
  const [filter, setFilter] = useState<string>('all')
  const [view, setView] = useState<'list' | 'cards'>('cards')

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [orders])

  const visible = useMemo(() => {
    let list = filter === 'all' ? orders : orders.filter(o => o.status === filter)
    return [...list].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))
  }, [orders, filter])

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


  function OrderRow({ o }: { o: Order }) {
    return (
      <button
        onClick={() => navigate(`/campo/os/${o.id}`)}
        className="w-full text-left bg-card border border-border rounded-lg px-3 py-3 active:bg-secondary/40 transition flex items-center gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-primary">{o.number}</span>
            <span className={'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ' + STATUS_STYLES[o.status]}>{STATUS_LABELS[o.status]}</span>
          </div>
          <p className="font-medium text-foreground text-sm truncate mt-0.5">{o.title}</p>
          <p className="text-xs text-muted-foreground truncate">{o.client?.name ?? '—'}{o.location?.name ? ' · ' + o.location.name : ''}</p>
        </div>
        <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
      </button>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">{saudacao()}{primeiroNome(user?.name) ? `, ${primeiroNome(user?.name)}` : ''} 👋</h1>
        <p className="text-sm text-muted-foreground">Vamos organizar os atendimentos de hoje?</p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={'rounded-xl border p-3 text-left transition ' + (filter === 'all' ? 'border-primary bg-primary/10' : 'border-border bg-card active:bg-secondary/40')}
        >
          <p className="text-2xl font-semibold text-foreground leading-none">{orders.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Todas</p>
        </button>
        {STATUS_CARDS.map(sc => (
          <button
            key={sc.key}
            onClick={() => setFilter(sc.key)}
            className={'rounded-xl border p-3 text-left transition ' + (filter === sc.key ? 'border-primary bg-primary/10' : 'border-border bg-card active:bg-secondary/40')}
          >
            <div className="flex items-center gap-1.5">
              <span className={'w-2 h-2 rounded-full ' + sc.dot} />
              <p className="text-2xl font-semibold text-foreground leading-none">{counts[sc.key] ?? 0}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{sc.label}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          {loading ? 'Carregando...' : `${visible.length} ${visible.length === 1 ? 'atendimento' : 'atendimentos'}`}
        </p>
        <div className="flex items-center gap-1 bg-secondary rounded-md p-1">
          <button onClick={() => setView('cards')} title="Cards" className={'w-7 h-7 rounded flex items-center justify-center transition ' + (view === 'cards' ? 'bg-card text-foreground' : 'text-muted-foreground')}>
            <LayoutGrid size={15} />
          </button>
          <button onClick={() => setView('list')} title="Lista" className={'w-7 h-7 rounded flex items-center justify-center transition ' + (view === 'list' ? 'bg-card text-foreground' : 'text-muted-foreground')}>
            <List size={15} />
          </button>
        </div>
      </div>

      {error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Nenhum atendimento"
            description={filter === 'all' ? 'Você não tem ordens de serviço atribuídas no momento.' : 'Nenhum atendimento neste status.'}
          />
        </Card>
      ) : view === 'cards' ? (
        <div className="space-y-3">
          {visible.map(o => <OrderCard key={o.id} o={o} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(o => <OrderRow key={o.id} o={o} />)}
        </div>
      )}
    </div>
  )
}
