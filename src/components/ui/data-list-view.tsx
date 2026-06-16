import { useState, useMemo, ReactNode } from 'react'
import { Search, LayoutGrid, List as ListIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useViewPreference, type ViewMode } from '@/hooks/useViewPreference'

export interface Column<T> {
  key: string
  header: string
  render: (item: T) => ReactNode
  className?: string
}

export interface FilterChip {
  key: string
  label: string
}

interface DataListViewProps<T> {
  items: T[]
  loading?: boolean
  // identificador único para salvar a preferência de visão no banco
  viewKey: string
  // texto de busca: função que extrai o texto pesquisável de um item
  searchText: (item: T) => string
  searchPlaceholder?: string
  // chips de filtro rápido (opcional)
  chips?: FilterChip[]
  activeChip?: string
  onChipChange?: (key: string) => void
  // colunas para a visão de tabela
  columns: Column<T>[]
  // render de um card para a visão de cards
  renderCard: (item: T) => ReactNode
  // ações da linha (tabela) — recebe o item
  rowActions?: (item: T) => ReactNode
  // chave única de cada item
  getKey: (item: T) => string
  emptyState?: ReactNode
}

export function DataListView<T>({
  items,
  loading,
  viewKey,
  searchText,
  searchPlaceholder = 'Buscar...',
  chips,
  activeChip,
  onChipChange,
  columns,
  renderCard,
  rowActions,
  getKey,
  emptyState,
}: DataListViewProps<T>) {
  const { mode, setMode } = useViewPreference(viewKey, 'table')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter(item => searchText(item).toLowerCase().includes(q))
  }, [items, query, searchText])

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
        <div className="flex items-center gap-1 bg-input border border-border rounded-md p-1 self-start">
          <button
            onClick={() => setMode('table' as ViewMode)}
            className={cn('w-8 h-8 rounded flex items-center justify-center transition', mode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            title="Visão em tabela"
          >
            <ListIcon size={16} />
          </button>
          <button
            onClick={() => setMode('cards' as ViewMode)}
            className={cn('w-8 h-8 rounded flex items-center justify-center transition', mode === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            title="Visão em cards"
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {chips && chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {chips.map(chip => (
            <button
              key={chip.key}
              onClick={() => onChipChange?.(chip.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition',
                activeChip === chip.key
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground mb-3">
        {loading ? 'Carregando...' : `${filtered.length} ${filtered.length === 1 ? 'resultado' : 'resultados'}`}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        emptyState ?? <div className="text-center py-16 text-sm text-muted-foreground">Nenhum resultado encontrado.</div>
      ) : mode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <div key={getKey(item)}>{renderCard(item)}</div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {columns.map(col => (
                    <th key={col.key} className={cn('text-left font-medium text-muted-foreground px-4 py-3 text-xs uppercase tracking-wider', col.className)}>
                      {col.header}
                    </th>
                  ))}
                  {rowActions && <th className="px-4 py-3 w-20" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={getKey(item)} className="border-b border-border last:border-0 hover:bg-secondary/40 transition">
                    {columns.map(col => (
                      <td key={col.key} className={cn('px-4 py-3 text-foreground', col.className)}>
                        {col.render(item)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">{rowActions(item)}</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
