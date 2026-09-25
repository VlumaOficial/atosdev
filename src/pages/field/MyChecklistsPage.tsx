import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMyChecklists, type MyChecklist } from '@/hooks/useMyChecklists'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ClipboardCheck, Building2, MapPin, ChevronRight, List, LayoutGrid, CalendarDays, Repeat } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { hojeNoFuso, situacaoOcorrencia, dataCurtaDia, type Situacao } from '@/lib/recorrencia'

const STATUS_LABELS: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído', atrasado: 'Atrasado' }
const STATUS_STYLES: Record<string, string> = {
  pendente: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  em_andamento: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  concluido: 'text-green-400 bg-green-500/10 border-green-500/30',
  atrasado: 'text-red-400 bg-red-500/10 border-red-500/30',
}

// Agrupamento por data (recorrência, 2026-09-25): o técnico vê o que é
// para hoje, o que atrasou e o que vem nos próximos dias
const STATUS_CARDS: { key: Situacao; label: string; dot: string }[] = [
  { key: 'hoje', label: 'Hoje', dot: 'bg-blue-400' },
  { key: 'atrasado', label: 'Atrasados', dot: 'bg-red-400' },
  { key: 'proximo', label: 'Próximos', dot: 'bg-slate-400' },
  { key: 'concluido', label: 'Concluídos', dot: 'bg-green-400' },
]

function LinhaData({ c, sit }: { c: MyChecklist; sit: Situacao }) {
  if (!c.data_prevista) return null
  const prazo = c.prazo && c.prazo !== c.data_prevista ? ` · até ${dataCurtaDia(c.prazo)}` : ''
  return (
    <p className={'flex items-center gap-1.5 text-xs ' + (sit === 'atrasado' ? 'text-red-400' : 'text-muted-foreground')}>
      <CalendarDays size={12} /> {sit === 'atrasado' ? `Atrasado — prazo era ${dataCurtaDia(c.prazo ?? c.data_prevista)}` : dataCurtaDia(c.data_prevista) + prazo}
    </p>
  )
}

export default function MyChecklistsPage() {
  const navigate = useNavigate()
  const { checklists, loading, error } = useMyChecklists()
  const { tenant } = useAuth()
  const hoje = hojeNoFuso(tenant?.fuso_horario)
  const [filter, setFilter] = useState<string>('hoje')
  const sit = (c: MyChecklist) => situacaoOcorrencia(c, hoje)
  const [view, setView] = useState<'list' | 'cards'>('cards')

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const it of checklists) { const k = sit(it); c[k] = (c[k] ?? 0) + 1 }
    return c
  }, [checklists, hoje]) // eslint-disable-line react-hooks/exhaustive-deps

  // ordem: atrasados/hoje primeiro pela data; concluídos do mais recente
  const visible = useMemo(() => {
    const l = filter === 'all' ? checklists : checklists.filter(it => sit(it) === filter)
    return [...l].sort((a, b) => filter === 'concluido'
      ? (b.data_prevista ?? '').localeCompare(a.data_prevista ?? '')
      : (a.data_prevista ?? '9999').localeCompare(b.data_prevista ?? '9999'))
  }, [checklists, filter, hoje]) // eslint-disable-line react-hooks/exhaustive-deps

  function ChecklistCard({ c }: { c: MyChecklist }) {
    return (
      <button
        onClick={() => navigate(`/campo/checklists/${c.id}`)}
        className="w-full text-left bg-card border border-border rounded-xl p-4 active:bg-secondary/40 transition"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className={'inline-block px-2 py-0.5 rounded-md text-xs font-medium border ' + STATUS_STYLES[sit(c) === 'atrasado' ? 'atrasado' : c.status]}>
            {STATUS_LABELS[sit(c) === 'atrasado' ? 'atrasado' : c.status]}
          </span>
          {c.recurrence && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground inline-flex items-center gap-1"><Repeat size={10} /> {c.recurrence}</span>}
        </div>
        <p className="font-medium text-foreground mb-2">{c.title_snapshot}</p>
        <div className="space-y-1 text-xs text-muted-foreground">
          <LinhaData c={c} sit={sit(c)} />
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
            <span className={'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ' + STATUS_STYLES[sit(c) === 'atrasado' ? 'atrasado' : c.status]}>{STATUS_LABELS[sit(c) === 'atrasado' ? 'atrasado' : c.status]}</span>
          </div>
          <p className="font-medium text-foreground text-sm truncate mt-0.5">{c.title_snapshot}</p>
          <p className="text-xs text-muted-foreground truncate">{c.client?.name ?? 'Geral'}{c.location?.name ? ' · ' + c.location.name : ''}</p>
          <LinhaData c={c} sit={sit(c)} />
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

      <div className="grid grid-cols-4 gap-2 mb-2">
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

      <button onClick={() => setFilter('all')} className={'text-xs mb-3 ' + (filter === 'all' ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground')}>
        Ver todos ({checklists.length})
      </button>

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
            description={filter === 'all' ? 'Você não tem checklists avulsos atribuídos no momento.' : filter === 'hoje' ? 'Nada para hoje.' : 'Nenhum checklist aqui.'}
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
