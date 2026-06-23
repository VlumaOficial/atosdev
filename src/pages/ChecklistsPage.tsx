import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChecklistTemplates } from '@/hooks/useChecklistTemplates'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ListChecks, Plus, Search, Power, Pencil, Building2, List, LayoutGrid } from 'lucide-react'

export default function ChecklistsPage() {
  const navigate = useNavigate()
  const { templates, loading, error, toggleActive } = useChecklistTemplates()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [view, setView] = useState<'list' | 'cards'>('list')

  const visible = useMemo(() => {
    let list = templates
    if (filter === 'ativos') list = list.filter(t => t.is_active)
    if (filter === 'inativos') list = list.filter(t => !t.is_active)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t => t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q))
    }
    return list
  }, [templates, filter, search])

  async function handleToggle(id: string, current: boolean) {
    try { await toggleActive(id, !current) } catch { alert('Não foi possível alterar o status.') }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Checklists</h1>
          <p className="text-sm text-muted-foreground">Modelos de verificação para OS e técnicos</p>
        </div>
        <Button variant="cta" onClick={() => navigate('/checklists/novo')}><Plus size={16} /> Novo modelo</Button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar modelo..."
            className="w-full pl-9 pr-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
        <div className="flex items-center gap-1">
          {(['todos', 'ativos', 'inativos'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={'px-3 py-1.5 rounded-md text-xs font-medium transition capitalize ' + (filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-md p-1">
          <button onClick={() => setView('list')} className={'w-7 h-7 rounded flex items-center justify-center transition ' + (view === 'list' ? 'bg-card text-foreground' : 'text-muted-foreground')}><List size={15} /></button>
          <button onClick={() => setView('cards')} className={'w-7 h-7 rounded flex items-center justify-center transition ' + (view === 'cards' ? 'bg-card text-foreground' : 'text-muted-foreground')}><LayoutGrid size={15} /></button>
        </div>
      </div>

      {error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : visible.length === 0 ? (
        <Card><EmptyState icon={ListChecks} title="Nenhum modelo" description="Crie seu primeiro modelo de checklist." /></Card>
      ) : view === 'list' ? (
        <Card className="divide-y divide-border">
          {visible.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition">
              <button onClick={() => navigate(`/checklists/${t.id}`)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{t.name}</span>
                  {!t.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">Inativo</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>{t.item_count} {t.item_count === 1 ? 'item' : 'itens'}</span>
                  {t.client?.name ? <span className="flex items-center gap-1"><Building2 size={11} /> {t.client.name}</span> : <span>Geral</span>}
                </div>
              </button>
              <button onClick={() => navigate(`/checklists/${t.id}`)} title="Editar" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition"><Pencil size={15} /></button>
              <button onClick={() => handleToggle(t.id, t.is_active)} title={t.is_active ? 'Desativar' : 'Ativar'} className={'w-8 h-8 rounded-md flex items-center justify-center transition hover:bg-secondary ' + (t.is_active ? 'text-green-400' : 'text-muted-foreground')}><Power size={15} /></button>
            </div>
          ))}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map(t => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <button onClick={() => navigate(`/checklists/${t.id}`)} className="font-medium text-foreground text-left">{t.name}</button>
                {!t.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">Inativo</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                <span>{t.item_count} {t.item_count === 1 ? 'item' : 'itens'}</span>
                {t.client?.name ? <span className="flex items-center gap-1"><Building2 size={11} /> {t.client.name}</span> : <span>Geral</span>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => navigate(`/checklists/${t.id}`)}><Pencil size={14} /> Editar</Button>
                <button onClick={() => handleToggle(t.id, t.is_active)} className={'w-9 h-9 rounded-md flex items-center justify-center border border-border transition hover:bg-secondary ' + (t.is_active ? 'text-green-400' : 'text-muted-foreground')}><Power size={15} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
