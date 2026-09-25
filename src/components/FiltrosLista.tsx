import { useState } from 'react'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Label, Input } from '@/components/ui/input'
import { PERIODOS, type ChavePeriodo } from '@/lib/periodo'
import { dataBR } from '@/lib/recorrencia'
import { cn } from '@/lib/utils'
import { SlidersHorizontal, X } from 'lucide-react'

// Barra de filtros padrão das listas (checklists avulsos, OS; depois F7):
// botão "Filtros (n)" abre o painel; filtros ativos viram etiquetas com
// "x"; "Limpar filtros" zera tudo. Quem usa guarda os valores (na URL).

export interface CampoFiltro {
  chave: string
  rotulo: string
  opcoes: ComboboxOption[]
  vazio?: string            // texto do "sem filtro" (ex.: "Todos os clientes")
}

interface Props {
  campos: CampoFiltro[]
  valores: Record<string, string>
  onChange: (chave: string, valor: string) => void
  periodo?: { valor: ChavePeriodo; de: string; ate: string; onChange: (p: ChavePeriodo, de?: string, ate?: string) => void; rotulo?: string }
  onLimpar: () => void
}

export default function FiltrosLista({ campos, valores, onChange, periodo, onLimpar }: Props) {
  const [aberto, setAberto] = useState(false)

  const ativos: { chave: string; texto: string; limpar: () => void }[] = []
  if (periodo?.valor) {
    const rot = PERIODOS.find(x => x.value === periodo.valor)?.label ?? ''
    const txt = periodo.valor === 'personalizado'
      ? `${periodo.de ? dataBR(periodo.de) : '…'} a ${periodo.ate ? dataBR(periodo.ate) : '…'}`
      : rot
    ativos.push({ chave: 'periodo', texto: (periodo.rotulo ?? 'Período') + ': ' + txt, limpar: () => periodo.onChange('') })
  }
  for (const c of campos) {
    const v = valores[c.chave]
    if (!v) continue
    const rot = c.opcoes.find(o => o.value === v)?.label ?? '…'
    ativos.push({ chave: c.chave, texto: `${c.rotulo}: ${rot}`, limpar: () => onChange(c.chave, '') })
  }

  return (
    <div className="mb-3 space-y-2" data-testid="filtros-lista">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
          className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition',
            aberto || ativos.length ? 'border-primary/40 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground')}>
          <SlidersHorizontal size={13} /> Filtros{ativos.length ? ` (${ativos.length})` : ''}
        </button>
        {ativos.map(a => (
          <span key={a.chave} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-secondary text-xs text-foreground" data-filtro-ativo={a.chave}>
            {a.texto}
            <button type="button" onClick={a.limpar} aria-label={'Remover filtro ' + a.texto} className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card">
              <X size={11} />
            </button>
          </span>
        ))}
        {ativos.length > 0 && (
          <button type="button" onClick={onLimpar} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">Limpar filtros</button>
        )}
      </div>

      {aberto && (
        <div className="rounded-lg border border-border bg-card p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {periodo && (
            <div className={periodo.valor === 'personalizado' ? 'sm:col-span-2 lg:col-span-3 grid gap-3 sm:grid-cols-3' : ''}>
              <div>
                <Label htmlFor="filtro-periodo">{periodo.rotulo ?? 'Período'}</Label>
                <select id="filtro-periodo" value={periodo.valor} onChange={e => periodo.onChange(e.target.value as ChavePeriodo, periodo.de, periodo.ate)}
                  className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground">
                  {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {periodo.valor === 'personalizado' && (<>
                <div>
                  <Label htmlFor="filtro-de">De</Label>
                  <Input id="filtro-de" type="date" value={periodo.de} onChange={e => periodo.onChange('personalizado', e.target.value, periodo.ate)} />
                </div>
                <div>
                  <Label htmlFor="filtro-ate">Até</Label>
                  <Input id="filtro-ate" type="date" value={periodo.ate} min={periodo.de || undefined} onChange={e => periodo.onChange('personalizado', periodo.de, e.target.value)} />
                </div>
              </>)}
            </div>
          )}
          {campos.map(c => (
            <div key={c.chave}>
              <Label htmlFor={'filtro-' + c.chave}>{c.rotulo}</Label>
              <Combobox id={'filtro-' + c.chave} value={valores[c.chave] ?? ''} onChange={v => onChange(c.chave, v)}
                options={[{ value: '', label: c.vazio ?? 'Todos' }, ...c.opcoes]}
                placeholder={c.vazio ?? 'Todos'} searchPlaceholder={'Buscar ' + c.rotulo.toLowerCase() + '...'} emptyText="Nada encontrado." />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
