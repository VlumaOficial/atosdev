import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import { FieldInput, FIELD_LABELS, temResposta } from '@/components/checklists/checklistFields'
import type { ChecklistItemSnapshot } from '@/hooks/useChecklistInstance'

interface ChecklistFillListProps {
  items: ChecklistItemSnapshot[]
  respostas: Record<string, any>
  itensAbertos: Record<string, boolean>
  onToggleItem: (itemId: string) => void
  onCampo: (itemId: string, fieldId: string, value: any) => void
  instanceId: string
  readOnly?: boolean
}

export default function ChecklistFillList({ items, respostas, itensAbertos, onToggleItem, onCampo, instanceId, readOnly }: ChecklistFillListProps) {
  return (
    <div className="space-y-4">
      {items.map(it => (
        <div key={it.id} className="border-b border-border pb-4 last:border-0">
          <button type="button" onClick={() => onToggleItem(it.id)}
            className="w-full flex items-center gap-2 text-left mb-2">
            {itensAbertos[it.id] ? <ChevronDown size={15} className="text-muted-foreground flex-shrink-0" /> : <ChevronRight size={15} className="text-muted-foreground flex-shrink-0" />}
            <span className="text-sm font-medium text-foreground flex-1 min-w-0">
              {it.label} {it.is_required && <span className="text-red-400">*</span>}
            </span>
            {temResposta(respostas[it.id]) && <CheckCircle2 size={15} className="text-green-400 flex-shrink-0" />}
          </button>
          <div className={'space-y-3 pl-6 ' + (itensAbertos[it.id] ? '' : 'hidden')}>
            {it.fields.map(f => (
              <div key={f.id}>
                <p className="text-xs text-muted-foreground mb-1">{FIELD_LABELS[f.type] ?? f.type}</p>
                <FieldInput field={f} value={respostas[it.id]?.[f.id]} onChange={(v) => onCampo(it.id, f.id, v)} instanceId={instanceId} readOnly={readOnly} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
