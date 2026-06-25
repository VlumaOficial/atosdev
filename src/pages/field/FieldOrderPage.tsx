import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrder } from '@/hooks/useOrder'
import OrderTimeline from '@/components/orders/OrderTimeline'
import OrderComments from '@/components/orders/OrderComments'
import OrderChecklist from '@/components/orders/OrderChecklist'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Label } from '@/components/ui/input'
import { ArrowLeft, Building2, MapPin, Navigation, FileText } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  aberta: 'Aberta', agendada: 'Agendada', em_andamento: 'Em andamento',
  pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada',
}
const STATUS_STYLES: Record<string, string> = {
  aberta: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  agendada: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  em_andamento: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  pausada: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  concluida: 'text-green-400 bg-green-500/10 border-green-500/30',
  cancelada: 'text-muted-foreground bg-secondary border-border',
}
const PRIORITY_LABELS: Record<string, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' }
const PRIORITY_STYLES: Record<string, string> = { normal: 'text-muted-foreground', alta: 'text-amber-400', urgente: 'text-red-400' }

// ações do técnico em campo (subconjunto do fluxo do gestor)
const FIELD_TRANSITIONS: Record<string, { target: string; label: string; reason?: boolean; notes?: boolean; completeDate?: boolean; date?: boolean; danger?: boolean }[]> = {
  aberta: [
    { target: 'em_andamento', label: 'Iniciar atendimento' },
    { target: 'agendada', label: 'Agendar', reason: true, date: true },
    { target: 'cancelada', label: 'Cancelar', reason: true, danger: true },
  ],
  agendada: [
    { target: 'em_andamento', label: 'Iniciar atendimento' },
    { target: 'cancelada', label: 'Cancelar', reason: true, danger: true },
  ],
  em_andamento: [
    { target: 'concluida', label: 'Concluir atendimento', notes: true, completeDate: true },
    { target: 'pausada', label: 'Pausar', reason: true },
    { target: 'agendada', label: 'Agendar', reason: true, date: true },
    { target: 'cancelada', label: 'Cancelar', reason: true, danger: true },
  ],
  pausada: [
    { target: 'em_andamento', label: 'Retomar' },
    { target: 'concluida', label: 'Concluir atendimento', notes: true, completeDate: true },
    { target: 'agendada', label: 'Agendar', reason: true, date: true },
    { target: 'cancelada', label: 'Cancelar', reason: true, danger: true },
  ],
  concluida: [],
  cancelada: [],
}


export default function FieldOrderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { order, loading, error, changeStatus } = useOrder(id)

  const [modal, setModal] = useState<{ open: boolean; target: string; reason: boolean; notes: boolean; completeDate: boolean; date: boolean }>({ open: false, target: '', reason: false, notes: false, completeDate: false, date: false })
  const [reasonInput, setReasonInput] = useState('')
  const [notesInput, setNotesInput] = useState('')
  const [completeDateInput, setCompleteDateInput] = useState('')
  const [scheduleDateInput, setScheduleDateInput] = useState('')
  const [modalError, setModalError] = useState('')
  const [saving, setSaving] = useState(false)

  function requestAction(action: { target: string; reason?: boolean; notes?: boolean; completeDate?: boolean; date?: boolean }) {
    if (action.reason || action.notes || action.completeDate || action.date) {
      setReasonInput(''); setNotesInput(''); setCompleteDateInput(''); setScheduleDateInput(''); setModalError('')
      setModal({ open: true, target: action.target, reason: !!action.reason, notes: !!action.notes, completeDate: !!action.completeDate, date: !!action.date })
    } else {
      apply(action.target)
    }
  }

  async function apply(target: string, extra?: any) {
    setSaving(true)
    try {
      await changeStatus(target as any, extra)
      setModal({ open: false, target: '', reason: false, notes: false, completeDate: false, date: false })
    } catch (err: any) {
      setModalError(err?.message ?? 'Não foi possível atualizar.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmModal() {
    setModalError('')
    if (modal.date) {
      if (!scheduleDateInput) { setModalError('Informe a data do agendamento.'); return }
      if (new Date(scheduleDateInput).getTime() <= new Date().getTime()) {
        setModalError('O agendamento deve ser para uma data e hora futura.'); return
      }
    }
    if (modal.reason && !reasonInput.trim()) { setModalError('Informe o motivo.'); return }
    if (modal.completeDate && completeDateInput && new Date(completeDateInput).getTime() > new Date().getTime()) {
      setModalError('A data de conclusão não pode ser no futuro.'); return
    }
    const extra: any = {}
    if (modal.target === 'agendada') { extra.scheduled_at = scheduleDateInput || null; extra.schedule_reason = reasonInput || null }
    if (modal.target === 'pausada') extra.pause_reason = reasonInput || null
    if (modal.target === 'cancelada') extra.cancel_reason = reasonInput || null
    if (modal.target === 'concluida') {
      extra.completion_notes = notesInput || null
      if (completeDateInput) extra.completed_at = new Date(completeDateInput).toISOString()
    }
    await apply(modal.target, extra)
  }


  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }
  if (error || !order) {
    return (
      <div className="max-w-lg mx-auto">
        <button onClick={() => navigate('/campo')} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4"><ArrowLeft size={16} /> Voltar</button>
        <Card className="p-6 text-center text-red-400 text-sm">{error ?? 'Atendimento não encontrado.'}</Card>
      </div>
    )
  }

  const actions = FIELD_TRANSITIONS[order.status] ?? []
  const enderecoPartes = [order.location?.address, order.location?.city, order.location?.state].filter(Boolean)
  const enderecoTexto = enderecoPartes.join(', ')
  const mapsUrl = enderecoTexto ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoTexto)}` : ''

  return (
    <div className="max-w-lg mx-auto pb-8">
      <button onClick={() => navigate('/campo')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition mb-4">
        <ArrowLeft size={16} /> Meus atendimentos
      </button>

      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-mono text-primary">{order.number}</span>
        <span className={'inline-block px-2.5 py-1 rounded-md text-xs font-medium border ' + STATUS_STYLES[order.status]}>{STATUS_LABELS[order.status]}</span>
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-1">{order.title}</h1>
      <p className={'text-xs font-medium mb-4 ' + PRIORITY_STYLES[order.priority]}>Prioridade: {PRIORITY_LABELS[order.priority]}</p>

      <Card className="p-4 mb-4">
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center gap-2 text-foreground"><Building2 size={15} className="text-muted-foreground flex-shrink-0" /> {order.client?.name ?? '—'}</div>
          {order.location?.name && <div className="flex items-center gap-2 text-foreground"><MapPin size={15} className="text-muted-foreground flex-shrink-0" /> {order.location.name}</div>}
          {enderecoTexto && <p className="text-xs text-muted-foreground pl-7">{enderecoTexto}</p>}
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border border-primary/30 text-primary text-sm font-medium active:bg-primary/10 transition">
            <Navigation size={15} /> Abrir no mapa
          </a>
        )}
      </Card>

      {order.description && (
        <Card className="p-4 mb-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><FileText size={12} /> O que fazer</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{order.description}</p>
        </Card>
      )}

      <Card className="p-4 mb-4">
        <p className="text-sm font-medium text-foreground mb-3">Linha do tempo</p>
        <OrderTimeline orderId={order.id} />
      </Card>

      <Card className="p-4 mb-4">
        <p className="text-sm font-medium text-foreground mb-3">Checklist</p>
        <OrderChecklist orderId={order.id} />
      </Card>

      {actions.length > 0 && (
        <div className="space-y-2 mb-4">
          {actions.map(a => (
            <button
              key={a.target}
              onClick={() => requestAction(a)}
              className={'w-full px-4 py-3 rounded-xl text-sm font-medium border transition active:opacity-80 ' + (a.danger ? 'border-red-500/30 text-red-400' : a.target === 'concluida' || a.target === 'em_andamento' ? 'bg-primary text-primary-foreground border-primary' : 'border-primary/30 text-primary')}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      <Card className="p-4">
        <OrderComments orderId={order.id} />
      </Card>

      <Modal
        open={modal.open}
        onOpenChange={(o) => { if (!o) setModal({ open: false, target: '', reason: false, notes: false, completeDate: false, date: false }) }}
        title="Confirmar"
        description={modal.target ? STATUS_LABELS[modal.target] : ''}
      >
        <div className="space-y-4">
          {modal.date && (
            <div>
              <Label htmlFor="sdate">Data/hora do agendamento</Label>
              <input id="sdate" type="datetime-local" value={scheduleDateInput} onChange={e => setScheduleDateInput(e.target.value)} className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
            </div>
          )}
          {modal.completeDate && (
            <div>
              <Label htmlFor="cdate">Data/hora da conclusão</Label>
              <input id="cdate" type="datetime-local" value={completeDateInput} onChange={e => setCompleteDateInput(e.target.value)} className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
              <p className="text-xs text-muted-foreground mt-1">Deixe em branco para usar o horário atual.</p>
            </div>
          )}
          {modal.notes && (
            <div>
              <Label htmlFor="notes">Relato do atendimento</Label>
              <textarea id="notes" value={notesInput} onChange={e => setNotesInput(e.target.value)} placeholder="Descreva o que foi realizado" rows={4} className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none" />
            </div>
          )}
          {modal.reason && (
            <div>
              <Label htmlFor="reason">Motivo *</Label>
              <textarea id="reason" value={reasonInput} onChange={e => setReasonInput(e.target.value)} placeholder="Descreva o motivo" rows={3} className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none" />
            </div>
          )}
          {modalError && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{modalError}</div>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal({ open: false, target: '', reason: false, notes: false, completeDate: false, date: false })}>Cancelar</Button>
            <Button type="button" variant="cta" loading={saving} onClick={confirmModal}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
