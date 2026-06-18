import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrder } from '@/hooks/useOrder'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Label } from '@/components/ui/input'
import { ArrowLeft, Building2, MapPin, Wrench, Calendar, Clock, Pause, CheckCircle2, XCircle, FileText } from 'lucide-react'

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

const TRANSITIONS: Record<string, { target: string; label: string; reason?: boolean; date?: boolean; notes?: boolean; completeDate?: boolean }[]> = {
  aberta: [
    { target: 'agendada', label: 'Agendar', reason: true, date: true },
    { target: 'em_andamento', label: 'Iniciar' },
    { target: 'cancelada', label: 'Cancelar', reason: true },
  ],
  agendada: [
    { target: 'em_andamento', label: 'Iniciar' },
    { target: 'concluida', label: 'Concluir', notes: true, completeDate: true },
    { target: 'cancelada', label: 'Cancelar', reason: true },
  ],
  em_andamento: [
    { target: 'pausada', label: 'Pausar', reason: true },
    { target: 'agendada', label: 'Agendar', reason: true, date: true },
    { target: 'concluida', label: 'Concluir', notes: true, completeDate: true },
    { target: 'cancelada', label: 'Cancelar', reason: true },
  ],
  pausada: [
    { target: 'em_andamento', label: 'Retomar' },
    { target: 'concluida', label: 'Concluir', notes: true, completeDate: true },
    { target: 'agendada', label: 'Agendar', reason: true, date: true },
    { target: 'cancelada', label: 'Cancelar', reason: true },
  ],
  concluida: [{ target: 'em_andamento', label: 'Reabrir' }],
  cancelada: [],
}

function fmt(dt: string | null): string {
  if (!dt) return '—'
  const d = new Date(dt)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { order, loading, error, changeStatus } = useOrder(id)

  const [statusModal, setStatusModal] = useState<{ open: boolean; target: string; needsReason: boolean; needsDate: boolean; needsNotes: boolean; needsCompleteDate: boolean }>({ open: false, target: '', needsReason: false, needsDate: false, needsNotes: false, needsCompleteDate: false })
  const [notesInput, setNotesInput] = useState('')
  const [completeDateInput, setCompleteDateInput] = useState('')
  const [reasonInput, setReasonInput] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [statusError, setStatusError] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)

  function requestStatusChange(action: { target: string; reason?: boolean; date?: boolean; notes?: boolean; completeDate?: boolean }) {
    if (action.reason || action.date || action.notes || action.completeDate) {
      setReasonInput('')
      setDateInput('')
      setNotesInput('')
      setCompleteDateInput('')
      setStatusError('')
      setStatusModal({ open: true, target: action.target, needsReason: !!action.reason, needsDate: !!action.date, needsNotes: !!action.notes, needsCompleteDate: !!action.completeDate })
    } else {
      applyStatusChange(action.target)
    }
  }

  async function applyStatusChange(target: string, extra?: any) {
    setStatusSaving(true)
    try {
      await changeStatus(target as any, extra)
      setStatusModal({ open: false, target: '', needsReason: false, needsDate: false, needsNotes: false, needsCompleteDate: false })
    } catch (err: any) {
      setStatusError(err?.message ?? 'Não foi possível mudar o status.')
    } finally {
      setStatusSaving(false)
    }
  }

  async function confirmStatusModal() {
    setStatusError('')
    if (statusModal.needsDate) {
      if (!dateInput) { setStatusError('Informe a data do agendamento.'); return }
      if (new Date(dateInput).getTime() <= new Date().getTime()) {
        setStatusError('O agendamento deve ser para uma data e hora futura.')
        return
      }
    }
    if (statusModal.needsReason && !reasonInput.trim()) {
      setStatusError('Informe o motivo.')
      return
    }
    if (statusModal.needsCompleteDate && completeDateInput && new Date(completeDateInput).getTime() > new Date().getTime()) {
      setStatusError('A data de conclusão não pode ser no futuro.')
      return
    }
    const extra: any = {}
    if (statusModal.target === 'agendada') { extra.scheduled_at = dateInput || null; extra.schedule_reason = reasonInput || null }
    if (statusModal.target === 'pausada') extra.pause_reason = reasonInput || null
    if (statusModal.target === 'cancelada') extra.cancel_reason = reasonInput || null
    if (statusModal.target === 'concluida') {
      extra.completion_notes = notesInput || null
      if (completeDateInput) extra.completed_at = new Date(completeDateInput).toISOString()
    }
    await applyStatusChange(statusModal.target, extra)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div>
        <Button variant="ghost" onClick={() => navigate('/os')}><ArrowLeft size={16} /> Voltar</Button>
        <Card className="p-6 text-center text-red-400 text-sm mt-4">{error ?? 'Ordem de serviço não encontrada.'}</Card>
      </div>
    )
  }

  const actions = TRANSITIONS[order.status] ?? []

  return (
    <div>
      <button onClick={() => navigate('/os')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition mb-4">
        <ArrowLeft size={16} /> Voltar para Ordens de Serviço
      </button>

      <PageHeader
        title={order.number}
        description={order.title}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className={'inline-block px-2.5 py-1 rounded-md text-xs font-medium border ' + STATUS_STYLES[order.status]}>
                {STATUS_LABELS[order.status]}
              </span>
              <span className={'text-xs font-medium ' + PRIORITY_STYLES[order.priority]}>Prioridade: {PRIORITY_LABELS[order.priority]}</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-foreground"><Building2 size={15} className="text-muted-foreground" /> {order.client?.name ?? '—'}</div>
              {order.location?.name && <div className="flex items-center gap-2 text-foreground"><MapPin size={15} className="text-muted-foreground" /> {order.location.name}</div>}
              <div className="flex items-center gap-2 text-foreground"><Wrench size={15} className="text-muted-foreground" /> {order.technician?.name ?? 'Sem técnico (backlog)'}</div>
            </div>
            {order.description && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><FileText size={12} /> Descrição</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{order.description}</p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <p className="text-sm font-medium text-foreground mb-3">Linha do tempo</p>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Clock size={15} className="text-muted-foreground mt-0.5" />
                <div><span className="text-muted-foreground">Criada em:</span> <span className="text-foreground">{fmt(order.created_at)}</span></div>
              </div>
              {order.scheduled_at && (
                <div className="flex items-start gap-2">
                  <Calendar size={15} className="text-purple-400 mt-0.5" />
                  <div>
                    <span className="text-muted-foreground">Agendada para:</span> <span className="text-foreground">{fmt(order.scheduled_at)}</span>
                    {order.schedule_reason && <p className="text-xs text-muted-foreground mt-0.5">Motivo: {order.schedule_reason}</p>}
                  </div>
                </div>
              )}
              {order.started_at && (
                <div className="flex items-start gap-2">
                  <Clock size={15} className="text-amber-400 mt-0.5" />
                  <div><span className="text-muted-foreground">Iniciada em:</span> <span className="text-foreground">{fmt(order.started_at)}</span></div>
                </div>
              )}
              {order.pause_reason && (
                <div className="flex items-start gap-2">
                  <Pause size={15} className="text-orange-400 mt-0.5" />
                  <div><span className="text-muted-foreground">Motivo da pausa:</span> <span className="text-foreground">{order.pause_reason}</span></div>
                </div>
              )}
              {order.completed_at && (
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-green-400 mt-0.5" />
                  <div>
                    <span className="text-muted-foreground">Concluída em:</span> <span className="text-foreground">{fmt(order.completed_at)}</span>
                    {order.completion_notes && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">Relato: {order.completion_notes}</p>}
                  </div>
                </div>
              )}
              {order.cancel_reason && (
                <div className="flex items-start gap-2">
                  <XCircle size={15} className="text-red-400 mt-0.5" />
                  <div><span className="text-muted-foreground">Motivo do cancelamento:</span> <span className="text-foreground">{order.cancel_reason}</span></div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-sm font-medium text-foreground mb-3">Ações</p>
            {actions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Esta OS está em um estado final.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {actions.map(action => (
                  <button
                    key={action.target}
                    onClick={() => requestStatusChange(action)}
                    className={'w-full px-3 py-2 rounded-md text-sm font-medium border transition ' + (action.target === 'cancelada' ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-primary/30 text-primary hover:bg-primary/10')}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={statusModal.open}
        onOpenChange={(o) => { if (!o) setStatusModal({ open: false, target: '', needsReason: false, needsDate: false, needsNotes: false, needsCompleteDate: false }) }}
        title="Confirmar mudança de status"
        description={statusModal.target ? STATUS_LABELS[statusModal.target] : ''}
      >
        <div className="space-y-4">
          {statusModal.needsDate && (
            <div>
              <Label htmlFor="schedule-date">Data do agendamento</Label>
              <input
                id="schedule-date"
                type="datetime-local"
                value={dateInput}
                onChange={e => setDateInput(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
            </div>
          )}
          {statusModal.needsReason && (
            <div>
              <Label htmlFor="reason">Motivo *</Label>
              <textarea
                id="reason"
                value={reasonInput}
                onChange={e => setReasonInput(e.target.value)}
                placeholder="Descreva o motivo"
                rows={3}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none"
              />
            </div>
          )}
          {statusModal.needsCompleteDate && (
            <div>
              <Label htmlFor="complete-date">Data/hora da conclusão</Label>
              <input
                id="complete-date"
                type="datetime-local"
                value={completeDateInput}
                onChange={e => setCompleteDateInput(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
              <p className="text-xs text-muted-foreground mt-1">Deixe em branco para usar o horário atual.</p>
            </div>
          )}
          {statusModal.needsNotes && (
            <div>
              <Label htmlFor="notes">Relato do atendimento</Label>
              <textarea
                id="notes"
                value={notesInput}
                onChange={e => setNotesInput(e.target.value)}
                placeholder="Descreva o que foi realizado no atendimento"
                rows={4}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none"
              />
            </div>
          )}
          {statusError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{statusError}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setStatusModal({ open: false, target: '', needsReason: false, needsDate: false, needsNotes: false, needsCompleteDate: false })}>Cancelar</Button>
            <Button type="button" variant="cta" loading={statusSaving} onClick={confirmStatusModal}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
