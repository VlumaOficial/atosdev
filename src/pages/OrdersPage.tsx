import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrders, useListaOS, type Order, type OrderInput, type OrderPriority } from '@/hooks/useOrders'
import { useAuth } from '@/hooks/useAuth'
import { useLocations } from '@/hooks/useLocations'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { DataListView, type Column } from '@/components/ui/data-list-view'
import FiltrosLista from '@/components/FiltrosLista'
import { intervaloDoPeriodo, type ChavePeriodo } from '@/lib/periodo'
import { hojeNoFuso } from '@/lib/recorrencia'
import { useClients } from '@/hooks/useClients'
import { useTechnicians } from '@/hooks/useTechnicians'
import { useChecklistTemplates } from '@/hooks/useChecklistTemplates'
import { supabase } from '@/lib/supabase'
import { removerArquivosDoChecklist } from '@/lib/armazenamento'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { Combobox } from '@/components/ui/combobox'
import { ClipboardList, Plus, Pencil, Building2, MapPin, Wrench } from 'lucide-react'

const emptyForm: OrderInput = { client_id: '', location_id: '', technician_id: '', title: '', description: '', priority: 'normal', require_signature: null }

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

const signatureOptions = [
  { value: '', label: 'Padrão do tenant' },
  { value: 'sim', label: 'Exigir assinatura' },
  { value: 'nao', label: 'Não exigir' },
]
function requireSignatureParaStr(v: boolean | null | undefined): string {
  if (v === true) return 'sim'
  if (v === false) return 'nao'
  return ''
}
function strParaRequireSignature(v: string): boolean | null {
  if (v === 'sim') return true
  if (v === 'nao') return false
  return null
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const { createOrder, updateOrder } = useOrders()
  const { tenant } = useAuth()
  const hoje = hojeNoFuso(tenant?.fuso_horario)
  // filtros + página na URL (voltar da OS mantém a lista como estava)
  const { valores: f, definir, limpar } = useFiltrosUrl({
    sit: 'todas', q: '', per: '', de: '', ate: '', cli: '', uni: '', tec: '', pri: '', pag: '1', tam: '25',
  })
  const periodo = intervaloDoPeriodo(f.per as ChavePeriodo, hoje, f.de, f.ate)
  const pagina = Math.max(1, parseInt(f.pag) || 1)
  const tamanho = parseInt(f.tam) || 25
  const { itens, total, contagens, loading, error, recarregar } = useListaOS({
    situacao: f.sit, q: f.q, de: periodo.de, ate: periodo.ate, cliente: f.cli, unidade: f.uni, tecnico: f.tec, prioridade: f.pri,
  }, pagina, tamanho)
  const { locations: todasUnidades } = useLocations()
  const [busca, setBusca] = useState(f.q)
  useEffect(() => { setBusca(f.q) }, [f.q])
  useEffect(() => {
    if (busca === f.q) return
    const t = setTimeout(() => definir({ q: busca.trim() }), 350)
    return () => clearTimeout(t)
  }, [busca]) // eslint-disable-line react-hooks/exhaustive-deps
  const { templates: checklistTemplates } = useChecklistTemplates()
  const { clients } = useClients()
  const { technicians } = useTechnicians()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [form, setForm] = useState<OrderInput>(emptyForm)
  const [checklistTemplateId, setChecklistTemplateId] = useState('')
  const [checklistInstancia, setChecklistInstancia] = useState<{ id: string; template_id: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

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

  const cont = (k: string) => contagens ? ` (${(contagens as any)[k] ?? 0})` : ''
  const chips = [
    { key: 'todas', label: 'Todas' + cont('todas') },
    { key: 'em_aberto', label: 'Em aberto' + cont('em_aberto') },
    ...statusChips.filter(c => c.key !== 'all').map(c => ({ key: c.key, label: c.label + cont(c.key) })),
  ]
  const unidadesFiltro = useMemo(() => todasUnidades.filter(l => !f.cli || l.client_id === f.cli)
    .map(l => ({ value: l.id, label: f.cli ? l.name : `${l.name} — ${l.client?.name ?? ''}` })), [todasUnidades, f.cli])
  const camposFiltro = [
    { chave: 'cli', rotulo: 'Cliente', opcoes: clientOptions, vazio: 'Todos os clientes' },
    { chave: 'uni', rotulo: 'Unidade', opcoes: unidadesFiltro, vazio: 'Todas as unidades' },
    { chave: 'tec', rotulo: 'Técnico', opcoes: [{ value: 'sem', label: 'Sem técnico (backlog)' }, ...technicians.map(t => ({ value: t.id, label: t.name }))], vazio: 'Todos os técnicos' },
    { chave: 'pri', rotulo: 'Prioridade', opcoes: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })), vazio: 'Todas as prioridades' },
  ]

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setChecklistTemplateId('')
    setFormError('')
    setModalOpen(true)
  }

  async function openEdit(e: React.MouseEvent, o: Order) {
    e.stopPropagation()
    setEditing(o)
    setForm({
      client_id: o.client_id,
      location_id: o.location_id ?? '',
      technician_id: o.technician_id ?? '',
      title: o.title,
      description: o.description ?? '',
      priority: o.priority,
      require_signature: o.require_signature,
    })
    // carrega o checklist atual da OS (um por OS) e pre-seleciona no campo
    const { data: inst } = await supabase
      .from('checklist_instances')
      .select('id, template_id')
      .eq('order_id', o.id)
      .eq('context_type', 'order')
      .maybeSingle()
    setChecklistInstancia(inst ? { id: inst.id, template_id: inst.template_id } : null)
    setChecklistTemplateId(inst?.template_id ?? '')
    setFormError('')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setChecklistTemplateId('')
    setChecklistInstancia(null)
    setEditing(null)
    setForm(emptyForm)
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
        const templateAtual = checklistInstancia?.template_id ?? ''
        if (checklistTemplateId !== templateAtual) {
          // removeu ou trocou: apaga a instancia anterior
          if (checklistInstancia) {
            const { error: erroDel } = await supabase.from('checklist_instances').delete().eq('id', checklistInstancia.id)
            if (!erroDel) await removerArquivosDoChecklist(checklistInstancia.id).catch(() => {})
          }
          // escolheu um novo modelo: cria a instancia
          if (checklistTemplateId) {
            const modelo = checklistTemplates.find(t => t.id === checklistTemplateId)
            await supabase.from('checklist_instances').insert({
              template_id: checklistTemplateId,
              title_snapshot: modelo?.name ?? 'Checklist',
              context_type: 'order',
              order_id: editing.id,
              status: 'pendente',
            })
          }
        }
      } else {
        const novoId = await createOrder(form)
        if (novoId && checklistTemplateId) {
          const modelo = checklistTemplates.find(t => t.id === checklistTemplateId)
          await supabase.from('checklist_instances').insert({
            template_id: checklistTemplateId,
            title_snapshot: modelo?.name ?? 'Checklist',
            context_type: 'order',
            order_id: novoId,
            status: 'pendente',
          })
        }
      }
      closeModal()
      recarregar()
    } catch (err: any) {
      setFormError(err?.message ?? 'Não foi possível salvar a OS.')
    } finally {
      setSaving(false)
    }
  }

  function StatusBadge({ status }: { status: string }) {
    return (
      <span className={'inline-block px-2 py-0.5 rounded-md text-xs font-medium border ' + STATUS_STYLES[status]}>
        {STATUS_LABELS[status]}
      </span>
    )
  }

  const colunas: Column<Order>[] = [
    { key: 'numero', header: 'OS', render: o => <span className="font-mono text-xs text-primary whitespace-nowrap" data-os={o.number}>{o.number}</span> },
    { key: 'titulo', header: 'Título', render: o => <span className="text-foreground">{o.title}</span> },
    { key: 'cliente', header: 'Cliente', render: o => <span className="text-muted-foreground">{o.client?.name ?? '—'}</span> },
    { key: 'tecnico', header: 'Técnico', render: o => <span className="text-muted-foreground">{o.technician?.name ?? 'Sem técnico'}</span> },
    { key: 'prioridade', header: 'Prioridade', render: o => <span className={'text-xs font-medium ' + PRIORITY_STYLES[o.priority]}>{PRIORITY_LABELS[o.priority]}</span> },
    { key: 'status', header: 'Status', render: o => <StatusBadge status={o.status} /> },
  ]
  function cartao(o: Order) {
    return (
      <Card className="p-4 cursor-pointer hover:border-primary/30 transition" onClick={() => navigate(`/os/${o.id}`)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-primary" data-os={o.number}>{o.number}</span>
              <span className={'text-xs font-medium ' + PRIORITY_STYLES[o.priority]}>{PRIORITY_LABELS[o.priority]}</span>
            </div>
            <p className="font-medium text-foreground truncate mt-0.5">{o.title}</p>
          </div>
          <button onClick={(e) => openEdit(e, o)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition flex-shrink-0">
            <Pencil size={14} />
          </button>
        </div>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5"><Building2 size={12} /> {o.client?.name ?? '—'}</p>
          {o.location?.name && <p className="flex items-center gap-1.5"><MapPin size={12} /> {o.location.name}</p>}
          <p className="flex items-center gap-1.5"><Wrench size={12} /> {o.technician?.name ?? 'Sem técnico'}</p>
        </div>
        <div className="mt-3 pt-3 border-t border-border"><StatusBadge status={o.status} /></div>
      </Card>
    )
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

      <FiltrosLista campos={camposFiltro}
        valores={{ cli: f.cli, uni: f.uni, tec: f.tec, pri: f.pri }}
        onChange={(k, v) => definir(k === 'cli' ? { cli: v, uni: '' } : { [k]: v })}
        periodo={{ rotulo: 'Aberta em', valor: f.per as ChavePeriodo, de: f.de, ate: f.ate, onChange: (per, de, ate) => definir({ per, de: per === 'personalizado' ? (de ?? '') : '', ate: per === 'personalizado' ? (ate ?? '') : '' }) }}
        onLimpar={() => limpar()} />
      {error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : (
        <DataListView<Order>
          items={itens}
          loading={loading}
          viewKey="orders"
          search={busca}
          onSearchChange={setBusca}
          searchPlaceholder="Buscar por número, título, cliente ou técnico..."
          page={pagina}
          pageSize={tamanho}
          total={total}
          totalPages={Math.max(1, Math.ceil(total / tamanho))}
          onPageChange={pg => definir({ pag: String(pg) })}
          onPageSizeChange={t => definir({ tam: String(t) })}
          chips={chips}
          activeChip={f.sit}
          onChipChange={k => definir({ sit: k })}
          columns={colunas}
          renderCard={cartao}
          rowActions={o => (
            <button onClick={(e) => openEdit(e, o)} title="Editar" className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition">
              <Pencil size={14} />
            </button>
          )}
          onRowClick={o => navigate(`/os/${o.id}`)}
          getKey={o => o.id}
          emptyState={
            <Card>
              <EmptyState icon={ClipboardList} title="Nenhuma ordem de serviço encontrada"
                description="Nenhuma OS com estes filtros. Crie uma nova ou ajuste os filtros."
                action={<Button onClick={openNew} variant="cta"><Plus size={16} /> Nova OS</Button>} />
            </Card>
          }
        />
      )}

      <Modal
        open={modalOpen}
        onOpenChange={(o) => { if (!o) closeModal(); else setModalOpen(true) }}
        title={editing ? `Editar ${editing.number}` : 'Nova ordem de serviço'}
        description={editing ? 'Atualize os dados da OS' : 'Registre um novo atendimento de campo'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="client">Cliente *</Label>
              <Combobox id="client" options={clientOptions} value={form.client_id} onChange={v => setForm({ ...form, client_id: v, location_id: '' })} placeholder="Selecione o cliente" searchPlaceholder="Buscar cliente..." emptyText="Nenhum cliente encontrado." />
            </div>
            <div>
              <Label htmlFor="location">Unidade</Label>
              <Combobox id="location" options={formLocations} value={form.location_id ?? ''} onChange={v => setForm({ ...form, location_id: v })} placeholder={form.client_id ? 'Selecione a unidade' : 'Escolha o cliente primeiro'} searchPlaceholder="Buscar unidade..." emptyText="Nenhuma unidade para este cliente." />
            </div>
            <div>
              <Label htmlFor="technician">Técnico responsável</Label>
              <Combobox id="technician" options={technicianOptions} value={form.technician_id ?? ''} onChange={v => setForm({ ...form, technician_id: v })} placeholder="Sem técnico (backlog)" searchPlaceholder="Buscar técnico..." emptyText="Nenhum técnico encontrado." />
            </div>
            <div>
              <Label htmlFor="priority">Prioridade</Label>
              <Combobox id="priority" options={priorityOptions} value={form.priority} onChange={v => setForm({ ...form, priority: v as OrderPriority })} placeholder="Prioridade" searchPlaceholder="Buscar..." emptyText="—" />
            </div>
            <div>
              <Label htmlFor="require-signature">Assinatura obrigatória</Label>
              <Combobox id="require-signature" options={signatureOptions} value={requireSignatureParaStr(form.require_signature)} onChange={v => setForm({ ...form, require_signature: strParaRequireSignature(v) })} placeholder="Padrão do tenant" searchPlaceholder="Buscar..." emptyText="—" />
            </div>
          </div>
          <div>
            <Label htmlFor="checklist">Checklist (opcional)</Label>
            <Combobox id="checklist" options={[{ value: '', label: 'Sem checklist' }, ...checklistTemplates.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name }))]} value={checklistTemplateId} onChange={v => setChecklistTemplateId(v)} placeholder="Sem checklist" searchPlaceholder="Buscar modelo..." emptyText="Nenhum modelo ativo." />
            {editing && checklistInstancia && checklistTemplateId !== checklistInstancia.template_id && (
              <p className="text-xs text-amber-400 mt-1">Trocar o checklist apaga as respostas já preenchidas.</p>
            )}
          </div>
          <div>
            <Label htmlFor="title">Título *</Label>
            <Input id="title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Manutenção preventiva CFTV" />
          </div>
          <div>
            <Label htmlFor="description">Descrição</Label>
            <textarea id="description" value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Detalhes do serviço a ser executado" rows={3} className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none" />
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
    </div>
  )
}
