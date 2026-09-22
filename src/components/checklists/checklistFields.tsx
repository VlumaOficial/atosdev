import FotoEvidencia from '@/components/orders/FotoEvidencia'
import { CheckCircle2, Circle, X } from 'lucide-react'

export { temResposta } from '@/hooks/useChecklistInstance'

export const FIELD_LABELS: Record<string, string> = {
  sim_nao: 'Sim / Não', texto: 'Observação', numero: 'Número',
  escolha_unica: 'Escolha uma', escolha_multipla: 'Selecione', foto: 'Foto',
}

export function FieldInput({ field, value, onChange, instanceId, readOnly }: { field: any; value: any; onChange: (v: any) => void; instanceId: string; readOnly?: boolean }) {
  const inputCls = "w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"

  if (field.type === 'sim_nao') {
    return (
      <div className="flex gap-2">
        {['Sim', 'Não'].map(op => (
          <button key={op} type="button" onClick={() => onChange(op)}
            className={'px-4 py-1.5 rounded-md text-sm border transition ' + (value === op ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            {op}
          </button>
        ))}
      </div>
    )
  }
  if (field.type === 'texto') {
    return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={2} placeholder="Resposta..." className={inputCls + ' resize-none'} />
  }
  if (field.type === 'numero') {
    return <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="0" className={inputCls} />
  }
  if (field.type === 'escolha_unica') {
    return (
      <div className="space-y-1.5">
        {field.options.map((op: string, i: number) => (
          <button key={i} type="button" onClick={() => onChange(op)}
            className={'w-full text-left px-3 py-2 rounded-md text-sm border transition flex items-center gap-2 ' + (value === op ? 'border-primary text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
            {value === op ? <CheckCircle2 size={15} className="text-primary" /> : <Circle size={15} />} {op}
          </button>
        ))}
      </div>
    )
  }
  if (field.type === 'escolha_multipla') {
    const arr: string[] = Array.isArray(value) ? value : []
    function toggle(op: string) {
      if (arr.includes(op)) onChange(arr.filter(x => x !== op))
      else onChange([...arr, op])
    }
    return (
      <div className="space-y-1.5">
        {field.options.map((op: string, i: number) => (
          <button key={i} type="button" onClick={() => toggle(op)}
            className={'w-full text-left px-3 py-2 rounded-md text-sm border transition flex items-center gap-2 ' + (arr.includes(op) ? 'border-primary text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
            <span className={'w-4 h-4 rounded border flex items-center justify-center ' + (arr.includes(op) ? 'bg-primary border-primary' : 'border-border')}>{arr.includes(op) && <X size={11} className="text-primary-foreground" />}</span> {op}
          </button>
        ))}
      </div>
    )
  }
  if (field.type === 'foto') {
    return <FotoEvidencia instanceId={instanceId} fieldId={field.id} value={value ?? null} onChange={onChange} readOnly={readOnly} />
  }
  return null
}
