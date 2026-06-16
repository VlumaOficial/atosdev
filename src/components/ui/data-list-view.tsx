import { ReactNode } from 'react'
import { Search, LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight } from 'lucide-react'
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
  viewKey: string
  // busca controlada (servidor)
  search: string
  onSearchChange: (q: string) => void
  searchPlaceholder?: string
  // paginação controlada (servidor)
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  pageSizeOptions?: number[]
  // chips de filtro
  chips?: FilterChip[]
  activeChip?: string
  onChipChange?: (key: string) => void
  // visões
  columns: Column<T>[]
  renderCard: (item: T) => ReactNode
  rowActions?: (item: T) => ReactNode
  getKey: (item: T) => string
  emptyState?: ReactNode
}

export function DataListView<T>({
  items,
  loading,
  viewKey,
  search,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
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

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
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
        {loading ? 'Carregando...' : total === 0 ? 'Nenhum resultado' : `Mostrando ${from}–${to} de ${total}`}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        emptyState ?? <div className="text-center py-16 text-sm text-muted-foreground">Nenhum resultado encontrado.</div>
      ) : (
        <>
          {mode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(item => (
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
                    {items.map(item => (
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

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Mostrar</span>
              <select
                value={pageSize}
                onChange={e => onPageSizeChange(Number(e.target.value))}
                className="bg-input border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {pageSizeOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <span>por página</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="w-8 h-8 rounded-md flex items-center justify-center border border-border text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary transition"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-muted-foreground px-2">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="w-8 h-8 rounded-md flex items-center justify-center border border-border text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
