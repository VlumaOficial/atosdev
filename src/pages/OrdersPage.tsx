import { useState, useMemo, useEffect } from 'react'
import { useOrders, type Order, type OrderInput, type OrderPriority } from '@/hooks/useOrders'
import { useClients } from '@/hooks/useClients'
import { useTechnicians } from '@/hooks/useTechnicians'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { Combobox } from '@/components/ui/combobox'
import { ClipboardList, Plus, Pencil, Building2, MapPin, Wrench } from 'lucide-react'

const emptyForm: OrderInput = { client_id: '', location_id: '', technician_id: '', title: '', description: '', priority: 'normal' }

const STATUS_LABELS: Record<string, string> = {
  aberta: 'Aberta',
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
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
const PRIORITY_STYLES: Record<string, string> = {
  normal: 'text-muted-foreground',
  alta: 'text-amber-400',
  urgente: 'text-red-400',
}

const statusChips = [
  { key: 'all', label: 'Todas' },
  { key: 'aberta', label: 'Abertas' },
  { key: 'agendada', label: 'Agendadas' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'pausada', label: 'Pausadas' },
  { key: 'concluida', label: 'Concluídas' },
  { key: 'cancelada', label: 'Canceladas' },
]

const priorityOptions = [
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
]

export default function OrdersPage() {
  const { orders, loading, error, createOrder, updateOrder, changeStatus } = useOrders()
  const { clients } = useClients()
  const { technicians } = useTechnicians()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [form, setForm] = useState<OrderInput>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [chip, setChip] = useState('all')
  const [query, setQuery] = useState('')
  // mini-modal de transição de status
  const [statusModal, setStatusModal] = useState<{ open: boolean; target: string; needsReason: boolean; needsDate: boolean }>({ open: false, target: '', needsReason: false, needsDate: false })
  const [reasonInput, setReasonInput] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState('')

  const [formLocations, setFormLocations] = useState<{ value: string; label: string }[]>([])

  const clientOptions = useMemo(() => clients.map(c => ({ value: c.id, label: c.name })), [clients])
  const technicianOptions = useMemo(
    () => [{ value: '', label: 'Sem técnico (backlog)' }, ...technicians.filter(t => t.active).map(t => ({ value: t.id, label: t.name }))],
    [technicians]
  )

  useEffect(() => {
    let active = true
    async function loadLocations() {
      if (!form.client_id) { setFormLocations([]); return }
      const { data } = await supabase
        .from('locations')
        .select('id, name')
        .eq('client_id', form.client_id)
        .order('is_primary', { ascending: false })
        .order('name', { ascending: true })
      if (active && data) {
        setFormLocations(data.map((l: any) => ({ value: l.id, label: l.name })))
      }
    }
    loadLocations()
    return () => { active = false }
  }, [form.client_id])

  const visible = useMemo(() => {
    let list = orders
    if (chip !== 'all') list = list.filter(o => o.status === chip)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(o =>
        `${o.number} ${o.title} ${o.client?.name ?? ''} ${o.technician?.name ?? ''}`.toLowerCase().includes(q)
      )
    }
    return list
  }, [orders, chip, query])

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(o: Order) {
    setEditing(o)
    setForm({
      client_id: o.client_id,
      location_id: o.location_id ?? '',
      technician_id: o.technician_id ?? '',
      title: o.title,
      description: o.description ?? '',
      priority: o.priority,
    })
    setFormError('')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  // transições permitidas por status atual
  const TRANSITIONS: Record<string, { target: string; label: string; reason?: boolean; date?: boolean }[]> = {
    aberta: [
      { target: 'agendada', label: 'Agendar', reason: true, date: true },
      { target: 'em_andamento', label: 'Iniciar' },
      { target: 'cancelada', label: 'Cancelar', reason: true },
    ],
    agendada: [
      { target: 'em_andamento', label: 'Iniciar' },
      { target: 'cancelada', label: 'Cancelar', reason: true },
    ],
    em_andamento: [
      { target: 'pausada', label: 'Pausar', reason: true },
      { target: 'concluida', label: 'Concluir' },
      { target: 'cancelada', label: 'Cancelar', reason: true },
    ],
    pausada: [
      { target: 'em_andamento', label: 'Retomar' },
      { target: 'concluida', label: 'Concluir' },
      { target: 'cancelada', label: 'Cancelar', reason: true },
    ],
    concluida: [
      { target: 'em_andamento', label: 'Reabrir' },
    ],
    cancelada: [],
  }

  function requestStatusChange(target: string, reason?: boolean, date?: boolean) {
    if (reason || date) {
      setReasonInput('')
      setDateInput('')
      setStatusError('')
      setStatusModal({ open: true, target, needsReason: !!reason, needsDate: !!date })
    } else {
      applyStatusChange(target)
    }
  }

  async function applyStatusChange(target: string, extra?: any) {
    if (!editing) return
    setStatusSaving(true)
    try {
      await changeStatus(editing.id, target as any, extra)
      setStatusModal({ open: false, target: '', needsReason: false, needsDate: false })
      closeModal()
    } catch (err: any) {
      setFormError(err?.message ?? 'Não foi possível mudar o status.')
    } finally {
      setStatusSaving(false)
    }
  }

  async function confirmStatusModal() {
    setStatusError('')
    // valida data no agendamento
    if (statusModal.needsDate) {
      if (!dateInput) {
        setStatusError('Informe a data do agendamento.')
        return
      }
      const escolhida = new Date(dateInput)
      const agora = new Date()
      // compara o instante completo (data + hora): deve ser futuro
      if (escolhida.getTime() <= agora.getTime()) {
        setStatusError('O agendamento deve ser para uma data e hora futura.')
        return
      }
    }
    // valida motivo obrigatório
    if (statusModal.needsReason && !reasonInput.trim()) {
      setStatusError('Informe o motivo.')
      return
    }
    const extra: any = {}
    if (statusModal.target === 'agendada') {
      extra.scheduled_at = dateInput || null
      extra.schedule_reason = reasonInput || null
    }
    if (statusModal.target === 'pausada') extra.pause_reason = reasonInput || null
    if (statusModal.target === 'cancelada') extra.cancel_reason = reasonInput || null
    await applyStatusChange(statusModal.target, extra)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.client_id) { setFormError('Selecione o cliente.'); return }
    if (!form.title.trim()) { setFormError('O título da OS é obrigatório.'); return }
    setSaving(true)
    try {
      if (editing) {
        await updateOrder(editing.id, form)
      } else {
        await createOrder(form)
      }
      closeModal()
    } catch (err: any) {
      setFormError(err?.message ?? 'Não foi possível salvar a OS.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço"
        description="Gerencie os atendimentos de campo"
        actions={
          <Button onClick={openNew} variant="cta">
            <Plus size={16} /> Nova OS
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por número, título, cliente ou técnico..."
          className="flex-1 px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {statusChips.map(c => (
          <button
            key={c.key}
            onClick={() => setChip(c.key)}
            className={'px-3 py-1.5 rounded-full text-xs font-medium border transition ' + (chip === c.key ? 'bg-primary/10 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-border hover:text-foreground')}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {loading ? 'Carregando...' : `${visible.length} ${visible.length === 1 ? 'ordem' : 'ordens'}`}
      </p>

      {error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma ordem de serviço"
            description="Crie a primeira OS para começar a organizar os atendimentos de campo."
            action={<Button onClick={openNew} variant="cta"><Plus size={16} /> Nova OS</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(o => (
            <Card key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-primary">{o.number}</span>
                    <span className={'text-xs font-medium ' + PRIORITY_STYLES[o.priority]}>{PRIORITY_LABELS[o.priority]}</span>
                  </div>
                  <p className="font-medium text-foreground truncate mt-0.5">{o.title}</p>
                </div>
                <button onClick={() => openEdit(o)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition flex-shrink-0">
                  <Pencil size={14} />
                </button>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 truncate"><Building2 size={12} /> {o.client?.name ?? '—'}</p>
                {o.location?.name && <p className="flex items-center gap-1.5 truncate"><MapPin size={12} /> {o.location.name}</p>}
                <p className="flex items-center gap-1.5 truncate"><Wrench size={12} /> {o.technician?.name ?? 'Sem técnico'}</p>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <span className={'inline-block px-2 py-1 rounded-md text-xs font-medium border ' + STATUS_STYLES[o.status]}>
                  {STATUS_LABELS[o.status]}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onOpenChange={(o) => { if (!o) closeModal(); else setModalOpen(true) }}
        title={editing ? `Editar ${editing.number}` : 'Nova ordem de serviço'}
        description={editing ? 'Atualize os dados da OS' : 'Registre um novo atendimento de campo'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {editing && (TRANSITIONS[editing.status] ?? []).length > 0 && (
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground mb-2">Status atual: <span className="font-medium text-foreground">{STATUS_LABELS[editing.status]}</span></p>
              <div className="flex flex-wrap gap-2">
                {(TRANSITIONS[editing.status] ?? []).map(action => (
                  <button
                    key={action.target}
                    type="button"
                    onClick={() => requestStatusChange(action.target, action.reason, action.date)}
                    className={'px-3 py-1.5 rounded-md text-xs font-medium border transition ' + (action.target === 'cancelada' ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-primary/30 text-primary hover:bg-primary/10')}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="client">Cliente *</Label>
            <Combobox
              id="client"
              options={clientOptions}
              value={form.client_id}
              onChange={v => setForm({ ...form, client_id: v, location_id: '' })}
              placeholder="Selecione o cliente"
              searchPlaceholder="Buscar cliente..."
              emptyText="Nenhum cliente encontrado."
            />
          </div>
          <div>
            <Label htmlFor="location">Unidade</Label>
            <Combobox
              id="location"
              options={formLocations}
              value={form.location_id ?? ''}
              onChange={v => setForm({ ...form, location_id: v })}
              placeholder={form.client_id ? 'Selecione a unidade' : 'Escolha o cliente primeiro'}
              searchPlaceholder="Buscar unidade..."
              emptyText="Nenhuma unidade para este cliente."
            />
          </div>
          <div>
            <Label htmlFor="technician">Técnico responsável</Label>
            <Combobox
              id="technician"
              options={technicianOptions}
              value={form.technician_id ?? ''}
              onChange={v => setForm({ ...form, technician_id: v })}
              placeholder="Sem técnico (backlog)"
              searchPlaceholder="Buscar técnico..."
              emptyText="Nenhum técnico encontrado."
            />
          </div>
          <div>
            <Label htmlFor="title">Título *</Label>
            <Input id="title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Manutenção preventiva CFTV" />
          </div>
          <div>
            <Label htmlFor="priority">Prioridade</Label>
            <Combobox
              id="priority"
              options={priorityOptions}
              value={form.priority}
              onChange={v => setForm({ ...form, priority: v as OrderPriority })}
              placeholder="Prioridade"
              searchPlaceholder="Buscar..."
              emptyText="—"
            />
          </div>
          <div>
            <Label htmlFor="description">Descrição</Label>
            <textarea
              id="description"
              value={form.description ?? ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Detalhes do serviço a ser executado"
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none"
            />
          </div>

          {formError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{formError}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" variant="cta" loading={saving}>{editing ? 'Salvar' : 'Criar OS'}</Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={statusModal.open}
        onOpenChange={(o) => { if (!o) setStatusModal({ open: false, target: '', needsReason: false, needsDate: false }) }}
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
          {statusError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{statusError}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setStatusModal({ open: false, target: '', needsReason: false, needsDate: false })}>Cancelar</Button>
            <Button type="button" variant="cta" loading={statusSaving} onClick={confirmStatusModal}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}