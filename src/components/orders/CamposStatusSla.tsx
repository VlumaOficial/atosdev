import { Label } from '@/components/ui/input'
import { useMotivosPausa } from '@/hooks/useCatalogoSla'

// Campos de SLA nos modais de mudança de status (migration 044) — usados no
// detalhe da OS (admin) e na OS do app do técnico:
//  * Pausar: motivo da lista da empresa (alguns param o relógio do SLA)
//  * Agendar: "a pedido do cliente" — a data agendada vira o prazo

export function MotivoPausaCampo({ valor, onChange }: { valor: string; onChange: (id: string, nome: string) => void }) {
  const { motivos } = useMotivosPausa()
  const ativos = motivos.filter(m => m.ativo)
  const escolhido = ativos.find(m => m.id === valor)
  return (
    <div>
      <Label htmlFor="motivo-pausa">Motivo da pausa *</Label>
      <select id="motivo-pausa" value={valor} onChange={e => onChange(e.target.value, ativos.find(m => m.id === e.target.value)?.nome ?? '')}
        className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground">
        <option value="">Selecione</option>
        {ativos.map(m => <option key={m.id} value={m.id}>{m.nome}{m.para_sla ? ' (para o relógio do SLA)' : ''}</option>)}
      </select>
      {escolhido && (
        <p className="text-[11px] text-muted-foreground mt-1">
          {escolhido.para_sla ? 'O prazo de SLA fica parado enquanto a OS estiver pausada.' : 'O prazo de SLA continua contando durante a pausa.'}
        </p>
      )}
    </div>
  )
}

export function AgendadoClienteCampo({ valor, onChange }: { valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border px-3 py-2">
      <input type="checkbox" checked={valor} onChange={e => onChange(e.target.checked)} className="mt-0.5" aria-label="Agendado a pedido do cliente" />
      <span>
        <span className="text-sm text-foreground">Agendado a pedido do cliente</span>
        <span className="block text-[11px] text-muted-foreground">A data combinada vira o prazo de atendimento do SLA.</span>
      </span>
    </label>
  )
}
