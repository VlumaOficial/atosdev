import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrder } from '@/hooks/useOrder'
import { useAuth } from '@/hooks/useAuth'
import OrderTimeline from '@/components/orders/OrderTimeline'
import OrderComments from '@/components/orders/OrderComments'
import OrderChecklist from '@/components/orders/OrderChecklist'
import CartaoSla, { TipoNivel } from '@/components/SlaOS'
import { MotivoPausaCampo, AgendadoClienteCampo } from '@/components/orders/CamposStatusSla'
import { useCategorias } from '@/hooks/useCatalogoSla'
import ConcluirOSModal from '@/components/assinatura/ConcluirOSModal'
import AssinaturasDaOS from '@/components/assinatura/AssinaturasDaOS'
import RelatorioOSButton from '@/components/orders/RelatorioOSButton'
import OrderEvidences from '@/components/orders/OrderEvidences'
import BaixarFotosOSButton from '@/components/orders/BaixarFotosOSButton'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Label } from '@/components/ui/input'
import { BotaoTransferir, HistoricoTransferencias } from '@/components/orders/TransferirOS'
import PortalInfoOS from '@/components/portal/PortalInfoOS'
import { ROTULO_NIVEL_GRUPO } from '@/lib/grupos'
import { ArrowLeft, Building2, MapPin, Wrench, FileText, Users2 } from 'lucide-react'

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


export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { order, loading, error, changeStatus, fetchOrder } = useOrder(id)
  const { tenant, user } = useAuth()

  const [statusModal, setStatusModal] = useState<{ open: boolean; target: string; needsReason: boolean; needsDate: boolean; needsNotes: boolean; needsCompleteDate: boolean }>({ open: false, target: '', needsReason: false, needsDate: false, needsNotes: false, needsCompleteDate: false })
  const [notesInput, setNotesInput] = useState('')
  const [completeDateInput, setCompleteDateInput] = useState('')
  const [reasonInput, setReasonInput] = useState('')
  // SLA (migration 044): motivo de pausa da lista e agendamento a pedido do cliente
  const [motivoPausa, setMotivoPausa] = useState<{ id: string; nome: string }>({ id: '', nome: '' })
  const [pedidoCliente, setPedidoCliente] = useState(false)
  const { opcoes: categoriasOp } = useCategorias()
  const [dateInput, setDateInput] = useState('')
  const [statusError, setStatusError] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [concluirAberto, setConcluirAberto] = useState(false)

  function requestStatusChange(action: { target: string; reason?: boolean; date?: boolean; notes?: boolean; completeDate?: boolean }) {
    if (action.target === 'concluida') { setConcluirAberto(true); return }
    if (action.reason || action.date || action.notes || action.completeDate) {
      setReasonInput(''); setMotivoPausa({ id: '', nome: '' }); setPedidoCliente(false)
      setDateInput('')
      setNotesInput('')
      setCompleteDateInput('')
      setStatusError('')
      setStatusModal({ open: true, target: action.target, needsReason: !!action.reason, needsDate: !!action.date, needsNotes: !!action.notes, needsCompleteDate: !!action.completeDate })
    } else {
      applyStatusChange(action.target)
    }
  }

  // atalho do chamado do portal: abre o agendamento já com a data pedida e "a pedido do cliente"
  function agendarComDataPedida(isoLocal: string) {
    setReasonInput('Data pedida pelo cliente no portal'); setMotivoPausa({ id: '', nome: '' }); setPedidoCliente(true)
    setDateInput(isoLocal); setNotesInput(''); setCompleteDateInput(''); setStatusError('')
    setStatusModal({ open: true, target: 'agendada', needsReason: true, needsDate: true, needsNotes: false, needsCompleteDate: false })
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
    if (statusModal.target === 'pausada' && !motivoPausa.id) { setStatusError('Escolha o motivo da pausa.'); return }
    if (statusModal.needsReason && statusModal.target !== 'pausada' && !reasonInput.trim()) {
      setStatusError('Informe o motivo.')
      return
    }
    if (statusModal.needsCompleteDate && completeDateInput && new Date(completeDateInput).getTime() > new Date().getTime()) {
      setStatusError('A data de conclusão não pode ser no futuro.')
      return
    }
    const extra: any = {}
    if (statusModal.target === 'agendada') { extra.scheduled_at = dateInput || null; extra.schedule_reason = reasonInput || null; extra.agendado_pelo_cliente = pedidoCliente }
    if (statusModal.target === 'pausada') { extra.pause_motivo_id = motivoPausa.id; extra.pause_reason = motivoPausa.nome + (reasonInput.trim() ? ' — ' + reasonInput.trim() : '') }
    if (statusModal.target === 'cancelada') extra.cancel_reason = reasonInput || null
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
              <TipoNivel tipo={order.tipo} nivel={order.priority} categoria={categoriasOp.find(c => c.value === order.categoria_id)?.label} />
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-foreground"><Building2 size={15} className="text-muted-foreground" /> {order.client?.name ?? '—'}</div>
              {order.location?.name && <div className="flex items-center gap-2 text-foreground"><MapPin size={15} className="text-muted-foreground" /> {order.location.name}</div>}
              <div className="flex items-center gap-2 text-foreground"><Wrench size={15} className="text-muted-foreground" /> {order.technician?.name ?? 'Sem técnico (backlog)'}</div>
              <div className="flex items-center gap-2 text-foreground" data-testid="os-grupo"><Users2 size={15} className="text-muted-foreground" />
                {order.grupo ? <>{order.grupo.nome} <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{ROTULO_NIVEL_GRUPO[order.grupo.nivel]}</span></> : <span className="text-muted-foreground">Sem grupo</span>}
                {!!order.transferencias && <span className="text-[11px] text-muted-foreground">· {order.transferencias} {order.transferencias === 1 ? 'transferência' : 'transferências'}</span>}
              </div>
            </div>
            {order.description && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><FileText size={12} /> Descrição</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{order.description}</p>
              </div>
            )}
          </Card>

          <CartaoSla o={order} />
          <PortalInfoOS orderId={order.id} numero={order.number} titulo={order.title} prioridadeAtual={order.priority}
            onAgendar={['aberta', 'agendada', 'pausada'].includes(order.status) ? agendarComDataPedida : undefined}
            podeTriar={['admin', 'gestor', 'atendente'].includes(user?.role ?? '') && !['concluida', 'cancelada'].includes(order.status)} onMudou={() => fetchOrder()} />
          <Card className="p-5">
            <p className="text-sm font-medium text-foreground mb-3">Linha do tempo</p>
            <OrderTimeline orderId={order.id} />
          </Card>
          {!!order.transferencias && (
            <Card className="p-5">
              <p className="text-sm font-medium text-foreground mb-3">Transferências</p>
              <HistoricoTransferencias orderId={order.id} criadaEm={order.created_at} grupoInicialId={order.grupo_id} />
            </Card>
          )}
          <Card className="p-5">
            <p className="text-sm font-medium text-foreground mb-3">Checklist</p>
            <OrderChecklist orderId={order.id} />
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-sm font-medium text-foreground">Evidências fotográficas</p>
              <BaixarFotosOSButton orderId={order.id} numero={order.number} />
            </div>
            <OrderEvidences orderId={order.id} readOnly />
          </Card>

          <Card className="p-5">
            <p className="text-sm font-medium text-foreground mb-3">Assinaturas</p>
            <AssinaturasDaOS order={order as any} exige={!!(order.require_signature ?? tenant?.require_signature_to_complete)} />
          </Card>

          {order.status === 'concluida' && (
            <Card className="p-5">
              <p className="text-sm font-medium text-foreground mb-3">Relatório do atendimento</p>
              <RelatorioOSButton orderId={order.id} numero={order.number} concluida cliente={order.client?.name ?? ''} />
            </Card>
          )}

          <Card className="p-5">
            <OrderComments orderId={order.id} portal={order.origem === 'portal'} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-sm font-medium text-foreground mb-3">Ações</p>
            {actions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Esta OS está em um estado final.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <BotaoTransferir order={order} onDone={fetchOrder} />
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

      <ConcluirOSModal open={concluirAberto} order={order as any} onClose={() => setConcluirAberto(false)}
        onConcluir={async extra => { await changeStatus('concluida' as any, extra); await fetchOrder() }} />

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
          {statusModal.target === 'agendada' && <AgendadoClienteCampo valor={pedidoCliente} onChange={setPedidoCliente} />}
          {statusModal.target === 'pausada' && <MotivoPausaCampo valor={motivoPausa.id} onChange={(id, nome) => setMotivoPausa({ id, nome })} />}
          {statusModal.needsReason && (
            <div>
              <Label htmlFor="reason">{statusModal.target === 'pausada' ? 'Observação (opcional)' : 'Motivo *'}</Label>
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
