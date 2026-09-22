import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMyChecklists, type MyChecklist } from '@/hooks/useMyChecklists'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ClipboardCheck, Building2, MapPin, ChevronRight, List, LayoutGrid } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído' }
const STATUS_STYLES: Record<string, string> = {
  pendente: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  em_andamento: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  concluido: 'text-green-400 bg-green-500/10 border-green-500/30',
}

const STATUS_CARDS: { key: string; label: string; dot: string }[] = [
  { key: 'pendente', label: 'Pendentes', dot: 'bg-blue-400' },
  { key: 'em_andamento', label: 'Em andamento', dot: 'bg-amber-400' },
  { key: 'concluido', label: 'Concluídos', dot: 'bg-green-400' },
]

export default function MyChecklistsPage() {
  const navigate = useNavigate()
  const { checklists, loading, error } = useMyChecklists()
  const [filter, setFilter] = useState<string>('all')
  const [view, setView] = useState<'list' | 'cards'>('cards')

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const it of checklists) c[it.status] = (c[it.status] ?? 0) + 1
    return c
  }, [checklists])

  const visible = useMemo(() => {
    if (filter === 'all') return checklists
    return checklists.filter(it => it.status === filter)
  }, [checklists, filter])

  function ChecklistCard({ c }: { c: MyChecklist }) {
    return (
      <button
        onClick={() => navigate(`/campo/checklists/${c.id}`)}
        className="w-full text-left bg-card border border-border rounded-xl p-4 active:bg-secondary/40 transition"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className={'inline-block px-2 py-0.5 rounded-md text-xs font-medium border ' + STATUS_STYLES[c.status]}>
            {STATUS_LABELS[c.status]}
          </span>
          {c.recurrence && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{c.recurrence}</span>}
        </div>
        <p className="font-medium text-foreground mb-2">{c.title_snapshot}</p>
        <div className="space-y-1 text-xs text-muted-foreground">
          {c.client?.name ? <p className="flex items-center gap-1.5"><Building2 size={12} /> {c.client.name}</p> : <p>Geral</p>}
          {c.location?.name && <p className="flex items-center gap-1.5"><MapPin size={12} /> {c.location.name}</p>}
        </div>
        <div className="flex items-center justify-end mt-2 text-primary text-xs">
          Ver checklist <ChevronRight size={14} />
        </div>
      </button>
    )
  }

  function ChecklistRow({ c }: { c: MyChecklist }) {
    return (
      <button
        onClick={() => navigate(`/campo/checklists/${c.id}`)}
        className="w-full text-left bg-card border border-border rounded-lg px-3 py-3 active:bg-secondary/40 transition flex items-center gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ' + STATUS_STYLES[c.status]}>{STATUS_LABELS[c.status]}</span>
          </div>
          <p className="font-medium text-foreground text-sm truncate mt-0.5">{c.title_snapshot}</p>
          <p className="text-xs text-muted-foreground truncate">{c.client?.name ?? 'Geral'}{c.location?.name ? ' · ' + c.location.name : ''}</p>
        </div>
        <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
      </button>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Checklists</h1>
        <p className="text-sm text-muted-foreground">Vistorias e inspeções atribuídas a você</p>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={'rounded-xl border p-3 text-left transition ' + (filter === 'all' ? 'border-primary bg-primary/10' : 'border-border bg-card active:bg-secondary/40')}
        >
          <p className="text-2xl font-semibold text-foreground leading-none">{checklists.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Todos</p>
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
          {loading ? 'Carregando...' : `${visible.length} ${visible.length === 1 ? 'checklist' : 'checklists'}`}
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
            icon={ClipboardCheck}
            title="Nenhum checklist"
            description={filter === 'all' ? 'Você não tem checklists avulsos atribuídos no momento.' : 'Nenhum checklist neste status.'}
          />
        </Card>
      ) : view === 'cards' ? (
        <div className="space-y-3">
          {visible.map(c => <ChecklistCard key={c.id} c={c} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(c => <ChecklistRow key={c.id} c={c} />)}
        </div>
      )}
    </div>
  )
}
