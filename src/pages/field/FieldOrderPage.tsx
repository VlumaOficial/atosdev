import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrder } from '@/hooks/useOrder'
import { useAuth } from '@/hooks/useAuth'
import OrderTimeline from '@/components/orders/OrderTimeline'
import OrderComments from '@/components/orders/OrderComments'
import OrderChecklist from '@/components/orders/OrderChecklist'
import CartaoSla, { TipoNivel } from '@/components/SlaOS'
import { MotivoPausaCampo, AgendadoClienteCampo, PausaClienteCampos, MotivoCancelamentoCampo } from '@/components/orders/CamposStatusSla'
import { useMotivosCancelamento } from '@/hooks/useCatalogoSla'
import { obterLocalizacao } from '@/lib/geolocation'
import GerarChamadoVisita from '@/components/orders/GerarChamadoVisita'
import type { MotivoPausa } from '@/hooks/useCatalogoSla'
import { useCategorias } from '@/hooks/useCatalogoSla'
import ConcluirOSModal from '@/components/assinatura/ConcluirOSModal'
import AssinaturasDaOS from '@/components/assinatura/AssinaturasDaOS'
import RelatorioOSButton from '@/components/orders/RelatorioOSButton'
import OrderEvidences from '@/components/orders/OrderEvidences'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Label } from '@/components/ui/input'
import { BotaoTransferir } from '@/components/orders/TransferirOS'
import PortalInfoOS from '@/components/portal/PortalInfoOS'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Building2, MapPin, Navigation, FileText, Users2, Hand } from 'lucide-react'

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


// ações do técnico em campo (subconjunto do fluxo do gestor)
const FIELD_TRANSITIONS: Record<string, { target: string; label: string; reason?: boolean; notes?: boolean; completeDate?: boolean; date?: boolean; danger?: boolean; ausente?: boolean }[]> = {
  aberta: [
    { target: 'em_andamento', label: 'Iniciar atendimento' },
    { target: 'agendada', label: 'Agendar', reason: true, date: true },
    { target: 'cancelada', label: 'Cliente ausente', reason: true, danger: true, ausente: true },
    { target: 'cancelada', label: 'Cancelar', reason: true, danger: true },
  ],
  agendada: [
    { target: 'agendada', label: 'Reagendar', reason: true, date: true },
    { target: 'em_andamento', label: 'Iniciar atendimento' },
    { target: 'cancelada', label: 'Cliente ausente', reason: true, danger: true, ausente: true },
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
  const { order, loading, error, changeStatus, fetchOrder } = useOrder(id)
  // OS da fila do grupo (sem técnico): o técnico pode assumir quando o grupo permite
  const [assumindo, setAssumindo] = useState(false)
  const [erroAssumir, setErroAssumir] = useState('')
  async function assumirOS() {
    if (!order) return
    setErroAssumir(''); setAssumindo(true)
    const { error: e } = await supabase.rpc('assumir_os', { p_order: order.id })
    setAssumindo(false)
    if (e) { setErroAssumir(e.message); return }
    await fetchOrder()
  }
  const { tenant } = useAuth()

  const [modal, setModal] = useState<{ open: boolean; target: string; reason: boolean; notes: boolean; completeDate: boolean; date: boolean; ausente?: boolean }>({ open: false, target: '', reason: false, notes: false, completeDate: false, date: false })
  const [reasonInput, setReasonInput] = useState('')
  // SLA (migration 044): motivo de pausa da lista e agendamento a pedido do cliente
  const [motivoPausa, setMotivoPausa] = useState<{ id: string; nome: string; obj?: MotivoPausa }>({ id: '', nome: '' })
  const [mensagemCliente, setMensagemCliente] = useState('')
  const [previsao, setPrevisao] = useState('')
  const [motivoCancel, setMotivoCancel] = useState<{ id: string; nome: string }>({ id: '', nome: '' })
  const { motivos: motivosCancel } = useMotivosCancelamento()
  const [pedidoCliente, setPedidoCliente] = useState(false)
  const { opcoes: categoriasOp } = useCategorias()
  const [notesInput, setNotesInput] = useState('')
  const [completeDateInput, setCompleteDateInput] = useState('')
  const [scheduleDateInput, setScheduleDateInput] = useState('')
  const [modalError, setModalError] = useState('')
  const [saving, setSaving] = useState(false)
  const [concluirAberto, setConcluirAberto] = useState(false)

  function requestAction(action: { target: string; reason?: boolean; notes?: boolean; completeDate?: boolean; date?: boolean; ausente?: boolean }) {
    if (action.target === 'concluida') { setConcluirAberto(true); return }
    if (action.reason || action.notes || action.completeDate || action.date) {
      setReasonInput(''); setMotivoPausa({ id: '', nome: '' }); setPedidoCliente(action.target === 'agendada' && !!order?.agendado_pelo_cliente); setMensagemCliente(''); setPrevisao(''); setNotesInput(''); setCompleteDateInput(''); setScheduleDateInput(''); setModalError('')
      // "Cliente ausente" já vem com o motivo do sistema escolhido
      const ausente = action.ausente ? motivosCancel.find(m => m.codigo === 'ausente') : undefined
      setMotivoCancel(ausente ? { id: ausente.id, nome: ausente.nome } : { id: '', nome: '' })
      setModal({ open: true, target: action.target, reason: !!action.reason, notes: !!action.notes, completeDate: !!action.completeDate, date: !!action.date, ausente: !!action.ausente })
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
    if (modal.target === 'pausada' && !motivoPausa.id) { setModalError('Escolha o motivo da pausa.'); return }
    const portal = order?.origem === 'portal'
    if (modal.target === 'pausada' && motivoPausa.obj) {
      const mo = motivoPausa.obj
      if (mo.exige_previsao && !previsao) { setModalError('Informe a previsão de retorno.'); return }
      if (previsao && new Date(previsao).getTime() <= new Date().getTime()) { setModalError('A previsão de retorno precisa ser uma data futura.'); return }
      if (mo.comportamento === 'aciona' && portal && mensagemCliente.trim().length < 2) { setModalError('Escreva a mensagem ao cliente (o que você precisa dele).'); return }
    }
    if (modal.target === 'cancelada' && !motivoCancel.id) { setModalError('Escolha o motivo do cancelamento.'); return }
    if (modal.reason && modal.target !== 'pausada' && modal.target !== 'cancelada' && !reasonInput.trim()) { setModalError('Informe o motivo.'); return }
    if (modal.completeDate && completeDateInput && new Date(completeDateInput).getTime() > new Date().getTime()) {
      setModalError('A data de conclusão não pode ser no futuro.'); return
    }
    const extra: any = {}
    if (modal.target === 'agendada') { extra.scheduled_at = scheduleDateInput || null; extra.schedule_reason = reasonInput || null; extra.agendado_pelo_cliente = pedidoCliente }
    if (modal.target === 'pausada') {
      extra.pause_motivo_id = motivoPausa.id; extra.pause_reason = motivoPausa.nome + (reasonInput.trim() ? ' — ' + reasonInput.trim() : '')
      if (previsao) extra.previsao_retorno = new Date(previsao).toISOString()
      if (motivoPausa.obj?.comportamento === 'aciona' && portal) {
        const { error } = await supabase.rpc('os_comentar', { p_order: order!.id, p_texto: mensagemCliente.trim(), p_visibilidade: 'cliente' })
        if (error) { setModalError(error.message); return }
      }
    }
    if (modal.target === 'cancelada') {
      extra.cancel_motivo_id = motivoCancel.id; extra.cancel_reason = motivoCancel.nome + (reasonInput.trim() ? ' — ' + reasonInput.trim() : '')
      if (modal.ausente) {
        // prova do "cliente ausente": hora (automática) e posição do técnico; as fotos do local ficam nas Evidências
        const pos = await obterLocalizacao()
        extra.cancel_detalhes = { cliente_ausente: true, ...(pos.coords ? { lat: pos.coords.lat, lng: pos.coords.lng, precisao_m: pos.coords.accuracy } : { sem_posicao: pos.erro ?? true }) }
      }
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
      <p className="mb-4"><TipoNivel tipo={order.tipo} nivel={order.priority} categoria={categoriasOp.find(c => c.value === order.categoria_id)?.label} /></p>
      <CartaoSla o={order} />

      <Card className="p-4 mb-4">
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center gap-2 text-foreground"><Building2 size={15} className="text-muted-foreground flex-shrink-0" /> {order.client?.name ?? '—'}</div>
          {order.location?.name && <div className="flex items-center gap-2 text-foreground"><MapPin size={15} className="text-muted-foreground flex-shrink-0" /> {order.location.name}</div>}
          {order.grupo && <div className="flex items-center gap-2 text-foreground" data-testid="os-grupo"><Users2 size={15} className="text-muted-foreground flex-shrink-0" /> Grupo: {order.grupo.nome}</div>}
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

      <div className="mb-4 empty:hidden"><PortalInfoOS orderId={order.id} numero={order.number} titulo={order.title} compacto /></div>

      <Card className="p-4 mb-4">
        <p className="text-sm font-medium text-foreground mb-3">Linha do tempo</p>
        <OrderTimeline orderId={order.id} />
      </Card>

      <Card className="p-4 mb-4">
        <p className="text-sm font-medium text-foreground mb-3">Checklist</p>
        <OrderChecklist orderId={order.id} />
      </Card>

      <Card className="p-4 mb-4">
        <p className="text-sm font-medium text-foreground mb-3">Evidências fotográficas</p>
        <OrderEvidences orderId={order.id} readOnly={order.status === 'concluida' || order.status === 'cancelada'} />
      </Card>

      <Card className="p-4 mb-4">
        <p className="text-sm font-medium text-foreground mb-3">Assinaturas</p>
        <AssinaturasDaOS order={order as any} exige={!!(order.require_signature ?? tenant?.require_signature_to_complete)} />
      </Card>

      {order.status === 'concluida' && (
        <Card className="p-4 mb-4">
          <p className="text-sm font-medium text-foreground mb-3">Relatório do atendimento</p>
          <RelatorioOSButton orderId={order.id} numero={order.number} concluida cliente={order.client?.name ?? ''} />
        </Card>
      )}

      {!order.technician_id && !['concluida', 'cancelada'].includes(order.status) && (
        <div className="space-y-2 mb-4" data-testid="os-na-fila">
          <p className="text-xs text-muted-foreground">Esta OS está na fila do seu grupo, sem técnico.</p>
          <button onClick={assumirOS} disabled={assumindo} data-testid="assumir-os"
            className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-primary text-primary-foreground border border-primary active:opacity-80 disabled:opacity-60 inline-flex items-center justify-center gap-2">
            <Hand size={15} /> {assumindo ? 'Assumindo…' : 'Assumir esta OS'}
          </button>
          {erroAssumir && <p className="text-xs text-red-400" role="alert">{erroAssumir}</p>}
        </div>
      )}

      {order.technician_id && actions.length > 0 && (
        <div className="space-y-2 mb-4">
          {actions.map(a => (
            <button
              key={a.label}
              onClick={() => requestAction(a)}
              className={'w-full px-4 py-3 rounded-xl text-sm font-medium border transition active:opacity-80 ' + (a.danger ? 'border-red-500/30 text-red-400' : a.target === 'concluida' || a.target === 'em_andamento' ? 'bg-primary text-primary-foreground border-primary' : 'border-primary/30 text-primary')}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {order.technician_id && <div className="mb-4 empty:hidden"><GerarChamadoVisita order={order} caminho="/campo/os/" /></div>}

      {order.technician_id && (
        <div className="mb-4">
          <BotaoTransferir order={order} onDone={() => navigate('/campo')}
            className="w-full px-4 py-3 rounded-xl text-sm font-medium border border-cyan-500/30 text-cyan-300 active:opacity-80 inline-flex items-center justify-center gap-2" />
        </div>
      )}

      <Card className="p-4">
        <OrderComments orderId={order.id} portal={order.origem === 'portal'} />
      </Card>

      <ConcluirOSModal open={concluirAberto} order={order as any} onClose={() => setConcluirAberto(false)}
        onConcluir={async extra => { await changeStatus('concluida' as any, extra); await fetchOrder() }} />

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
          {modal.target === 'agendada' && <AgendadoClienteCampo valor={pedidoCliente} onChange={setPedidoCliente} />}
          {modal.target === 'cancelada' && <MotivoCancelamentoCampo valor={motivoCancel.id} onChange={(id, nome) => setMotivoCancel({ id, nome })} />}
          {modal.ausente && <p className="text-[11px] text-muted-foreground" data-testid="aviso-ausente">A hora e a sua posição ficam registradas como prova. Se puder, tire uma foto do local na seção Evidências antes de confirmar (depois do cancelamento ela fica só para consulta).</p>}
          {modal.target === 'pausada' && <MotivoPausaCampo valor={motivoPausa.id} onChange={(id, nome, obj) => setMotivoPausa({ id, nome, obj })} />}
          {modal.target === 'pausada' && <PausaClienteCampos motivo={motivoPausa.obj} portal={order?.origem === 'portal'} mensagem={mensagemCliente} setMensagem={setMensagemCliente} previsao={previsao} setPrevisao={setPrevisao} />}
          {modal.reason && (
            <div>
              <Label htmlFor="reason">{modal.target === 'pausada' || modal.target === 'cancelada' ? 'Observação (opcional)' : 'Motivo *'}</Label>
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
