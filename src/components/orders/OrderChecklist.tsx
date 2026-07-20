import { useState } from 'react'
import { useOrderChecklist } from '@/hooks/useOrderChecklist'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ListChecks, CheckCircle2, Circle, Trash2, X } from 'lucide-react'

function temResposta(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'object') {
    return Object.values(value).some(v => Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && v !== ''))
  }
  return value !== ''
}

function FieldInput({ field, value, onChange }: { field: any; value: any; onChange: (v: any) => void }) {
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
    return <p className="text-xs text-muted-foreground italic">Anexo de foto disponível em breve.</p>
  }
  return null
}

const FIELD_LABELS: Record<string, string> = {
  sim_nao: 'Sim / Não', texto: 'Observação', numero: 'Número',
  escolha_unica: 'Escolha uma', escolha_multipla: 'Selecione', foto: 'Foto',
}

export default function OrderChecklist({ orderId }: { orderId: string }) {
  const { checklist, loading, desassociar, salvarResposta, obrigatoriosPendentes, concluir, reabrir } = useOrderChecklist(orderId)
  const { user } = useAuth()
  const podeReabrir = user?.role === 'admin' || user?.role === 'gestor' || user?.role === 'super_admin'
  const [preencherAberto, setPreencherAberto] = useState(false)
  const [respLocal, setRespLocal] = useState<Record<string, any>>({})
  const [salvandoProgresso, setSalvandoProgresso] = useState(false)

  if (loading) return <p className="text-xs text-muted-foreground">Carregando checklist...</p>

  if (!checklist) {
    return (
      <p className="text-sm text-muted-foreground text-center py-2">Nenhum checklist nesta OS. Associe um ao criar a ordem de serviço.</p>
    )
  }

  const respondidos = checklist.items.filter(it => temResposta(checklist.answers[it.id]?.value)).length
  const total = checklist.items.length
  const pendentesObrig = obrigatoriosPendentes()
  const concluido = checklist.status === 'concluido'

  function abrirPreencher() {
    const inicial: Record<string, any> = {}
    for (const it of checklist!.items) inicial[it.id] = checklist!.answers[it.id]?.value ?? {}
    setRespLocal(inicial)
    setPreencherAberto(true)
  }

  function setCampo(itemId: string, fieldId: string, v: any) {
    setRespLocal(prev => ({ ...prev, [itemId]: { ...(prev[itemId] ?? {}), [fieldId]: v } }))
  }

  async function handleSalvarProgresso() {
    setSalvandoProgresso(true)
    try {
      for (const it of checklist!.items) {
        const val = respLocal[it.id]
        if (temResposta(val)) await salvarResposta(it.id, it, val)
      }
      setPreencherAberto(false)
    } catch {
      alert('Não foi possível salvar o progresso.')
    } finally {
      setSalvandoProgresso(false)
    }
  }

  async function handleReabrir() {
    if (confirm('Reabrir este checklist para edição? A ação ficará registrada.')) {
      await reabrir()
    }
  }

  async function handleConcluir() {
    // valida obrigatorios olhando o que esta na tela (respLocal)
    const faltando = checklist!.items.filter(it => it.is_required && !temResposta(respLocal[it.id]))
    if (faltando.length > 0) {
      alert('Responda todos os itens obrigatórios antes de concluir.')
      return
    }
    // salva todas as respostas preenchidas antes de concluir
    for (const it of checklist!.items) {
      const val = respLocal[it.id]
      if (temResposta(val)) {
        await salvarResposta(it.id, it, val)
      }
    }
    await concluir()
    setPreencherAberto(false)
  }

  return (
    <div>
      <div className="border border-border rounded-lg p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <ListChecks size={16} className={concluido ? 'text-green-400' : 'text-primary'} />
            <span className="text-sm font-medium text-foreground truncate">{checklist.title}</span>
          </div>
          {concluido
            ? <span className="text-xs px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/30 flex-shrink-0">Concluído</span>
            : <span className="text-xs text-muted-foreground flex-shrink-0">{respondidos}/{total}</span>}
        </div>
        {!concluido && pendentesObrig > 0 && <p className="text-xs text-amber-400 mb-2">{pendentesObrig} {pendentesObrig === 1 ? 'item obrigatório pendente' : 'itens obrigatórios pendentes'}</p>}
        <div className="flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={abrirPreencher}>{concluido ? 'Ver checklist' : 'Preencher'}</Button>
          {concluido && podeReabrir && <Button variant="ghost" onClick={handleReabrir}>Reabrir</Button>}
          {!concluido && <button onClick={async () => { if (confirm('Remover o checklist desta OS?')) await desassociar() }} title="Remover" className="w-9 h-9 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-red-400 transition"><Trash2 size={15} /></button>}
        </div>
      </div>

      <Modal open={preencherAberto} onOpenChange={setPreencherAberto} title={checklist.title} description={concluido ? 'Checklist concluído.' : 'Responda os itens abaixo.'}>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {checklist.items.map(it => (
            <div key={it.id} className="border-b border-border pb-4 last:border-0">
              <p className="text-sm font-medium text-foreground mb-2">
                {it.label} {it.is_required && <span className="text-red-400">*</span>}
              </p>
              <div className="space-y-3">
                {it.fields.map(f => (
                  <div key={f.id}>
                    <p className="text-xs text-muted-foreground mb-1">{FIELD_LABELS[f.type] ?? f.type}</p>
                    <FieldInput field={f} value={respLocal[it.id]?.[f.id]} onChange={(v) => setCampo(it.id, f.id, v)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {!concluido && (
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-2">
            <Button variant="ghost" onClick={() => setPreencherAberto(false)}>Fechar</Button>
            <Button variant="outline" loading={salvandoProgresso} onClick={handleSalvarProgresso}>Salvar progresso</Button>
            <Button variant="cta" onClick={handleConcluir}>Concluir checklist</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
