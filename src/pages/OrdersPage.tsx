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
import { ClipboardList, Plus, Pencil, Building2, MapPin, Wrench, Timer } from 'lucide-react'
import { useCategorias } from '@/hooks/useCatalogoSla'
import { SeloSla, TipoNivel } from '@/components/SlaOS'
import { TIPOS, IMPACTOS, URGENCIAS, NIVEIS, NIVEIS_INCIDENTE, ROTULO_NIVEL, ESTILO_NIVEL, nivelDaOS, dataHora, type Matriz, type TipoOS } from '@/lib/sla'

const emptyForm: OrderInput = { client_id: '', location_id: '', technician_id: '', title: '', description: '', priority: 'baixo', require_signature: null, tipo: 'incidente', categoria_id: '', impacto: '', urgencia: '' }

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
// níveis da migration 044 (SLA ITSM)
const PRIORITY_LABELS = ROTULO_NIVEL
const PRIORITY_STYLES = ESTILO_NIVEL

const statusChips = [
  { key: 'all', label: 'Todas' },
  { key: 'aberta', label: 'Abertas' },
  { key: 'agendada', label: 'Agendadas' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'pausada', label: 'Pausadas' },
  { key: 'concluida', label: 'Concluídas' },
  { key: 'cancelada', label: 'Canceladas' },
]

const priorityOptions = NIVEIS_INCIDENTE.map(n => ({ value: n.value, label: n.label }))

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
    sit: 'em_aberto', q: '', per: '', de: '', ate: '', cli: '', uni: '', tec: '', pri: '', tipo: '', cat: '', sla: '', pag: '1', tam: '25',
  })
  const periodo = intervaloDoPeriodo(f.per as ChavePeriodo, hoje, f.de, f.ate)
  const pagina = Math.max(1, parseInt(f.pag) || 1)
  const tamanho = parseInt(f.tam) || 25
  const { itens, total, contagens, loading, error, recarregar } = useListaOS({
    situacao: f.sit, q: f.q, de: periodo.de, ate: periodo.ate, cliente: f.cli, unidade: f.uni, tecnico: f.tec, prioridade: f.pri,
    tipo: f.tipo, categoria: f.cat, sla: f.sla,
  }, pagina, tamanho)
  const { opcoes: categoriasOp, categorias } = useCategorias()
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
    { chave: 'tipo', rotulo: 'Tipo', opcoes: TIPOS.map(t => ({ value: t.value, label: t.label })), vazio: 'Todos os tipos' },
    { chave: 'pri', rotulo: 'Prioridade', opcoes: [{ value: 'critico,alto', label: 'Crítico e Alto' }, ...NIVEIS.map(n => ({ value: n.value, label: n.label }))], vazio: 'Todas as prioridades' },
    { chave: 'cat', rotulo: 'Categoria', opcoes: categoriasOp, vazio: 'Todas as categorias' },
    { chave: 'sla', rotulo: 'SLA', opcoes: [{ value: 'vencido', label: 'Vencido' + (contagens ? ` (${(contagens as any).sla_vencido ?? 0})` : '') }, { value: 'em_risco', label: 'Em risco' + (contagens ? ` (${(contagens as any).sla_em_risco ?? 0})` : '') }, { value: 'no_prazo', label: 'No prazo' }, { value: 'pausado', label: 'Pausado' }, { value: 'cumprido', label: 'Cumprido' }, { value: 'violado', label: 'Violado' }, { value: 'sem_sla', label: 'Sem SLA' }], vazio: 'Qualquer situação' },
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
      tipo: o.tipo ?? 'incidente',
      categoria_id: o.categoria_id ?? '',
      impacto: o.impacto ?? '',
      urgencia: o.urgencia ?? '',
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
    { key: 'prioridade', header: 'Tipo / prioridade', render: o => <TipoNivel tipo={o.tipo} nivel={o.priority} /> },
    { key: 'sla', header: 'SLA', render: o => <SeloSla o={o} comTexto /> },
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
        <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2"><StatusBadge status={o.status} /><SeloSla o={o} comTexto /></div>
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
        valores={{ cli: f.cli, uni: f.uni, tec: f.tec, pri: f.pri, tipo: f.tipo, cat: f.cat, sla: f.sla }}
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
              <Label htmlFor="require-signature">Assinatura obrigatória</Label>
              <Combobox id="require-signature" options={signatureOptions} value={requireSignatureParaStr(form.require_signature)} onChange={v => setForm({ ...form, require_signature: strParaRequireSignature(v) })} placeholder="Padrão do tenant" searchPlaceholder="Buscar..." emptyText="—" />
            </div>
          </div>
          <ClassificacaoOS form={form} setForm={setForm} categoriasOp={categoriasOp} categorias={categorias} editando={!!editing} />
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

// Tipo + categoria + prioridade (matriz Impacto × Urgência ou escolha direta) e prévia do SLA
function ClassificacaoOS({ form, setForm, categoriasOp, categorias, editando }: {
  form: OrderInput; setForm: (f: OrderInput) => void; categoriasOp: { value: string; label: string }[]
  categorias: { id: string; impacto: string | null; urgencia: string | null; pai_id: string | null }[]; editando: boolean
}) {
  const { tenant } = useAuth()
  const modo = tenant?.prioridade_modo ?? 'matriz'
  const tipo = (form.tipo ?? 'incidente') as TipoOS
  const nivel = nivelDaOS(tipo, modo, tenant?.prioridade_matriz as Matriz | undefined, form.impacto, form.urgencia, form.priority)
  const [previa, setPrevia] = useState<any>(null)
  const chave = JSON.stringify([tipo, form.impacto, form.urgencia, form.priority, form.client_id, form.categoria_id, form.location_id])
  useEffect(() => {
    let vivo = true
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('previa_sla', { p_tipo: tipo, p_impacto: form.impacto || null, p_urgencia: form.urgencia || null,
        p_prioridade: form.priority, p_client: form.client_id || null, p_categoria: form.categoria_id || null, p_location: form.location_id || null })
      if (vivo) setPrevia(data)
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps

  function escolherCategoria(id: string) {
    const c = categorias.find(x => x.id === id)
    const pai = c?.pai_id ? categorias.find(x => x.id === c.pai_id) : null
    const imp = c?.impacto ?? pai?.impacto, urg = c?.urgencia ?? pai?.urgencia
    setForm({ ...form, categoria_id: id, ...(tipo === 'incidente' && imp && urg ? { impacto: imp, urgencia: urg } : {}) })
  }
  const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground'
  return (
    <div className="rounded-md border border-border p-3 space-y-3" data-testid="classificacao-os">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="tipo">Tipo *</Label>
          <select id="tipo" value={tipo} onChange={e => setForm({ ...form, tipo: e.target.value as TipoOS })} className={campo}>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label} — {t.descricao}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="categoria">Categoria</Label>
          <Combobox id="categoria" options={[{ value: '', label: 'Sem categoria' }, ...categoriasOp]} value={form.categoria_id ?? ''} onChange={escolherCategoria}
            placeholder="Sem categoria" searchPlaceholder="Buscar categoria..." emptyText="Nenhuma categoria — crie em Catálogo e SLA." />
        </div>
        {tipo === 'incidente' && modo === 'matriz' && (<>
          <div>
            <Label htmlFor="impacto">Impacto</Label>
            <select id="impacto" value={form.impacto ?? ''} onChange={e => setForm({ ...form, impacto: e.target.value })} className={campo}>
              <option value="">Selecione</option>{IMPACTOS.map(i => <option key={i.value} value={i.value}>{i.label} — {i.descricao}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="urgencia">Urgência</Label>
            <select id="urgencia" value={form.urgencia ?? ''} onChange={e => setForm({ ...form, urgencia: e.target.value })} className={campo}>
              <option value="">Selecione</option>{URGENCIAS.map(u => <option key={u.value} value={u.value}>{u.label} — {u.descricao}</option>)}
            </select>
          </div>
        </>)}
        {tipo === 'incidente' && modo === 'simples' && (
          <div>
            <Label htmlFor="priority">Prioridade</Label>
            <Combobox id="priority" options={priorityOptions} value={form.priority} onChange={v => setForm({ ...form, priority: v as OrderPriority })} placeholder="Prioridade" searchPlaceholder="Buscar..." emptyText="—" />
          </div>
        )}
      </div>
      <div className="text-xs flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="classificacao-resumo">
        <span className="text-muted-foreground">Prioridade: <b className={ESTILO_NIVEL[nivel]}>{ROTULO_NIVEL[nivel]}</b>
          {tipo === 'incidente' && modo === 'matriz' && (!form.impacto || !form.urgencia) && <span className="text-amber-300"> (informe impacto e urgência para calcular — sem eles fica {ROTULO_NIVEL[nivel]})</span>}</span>
        {previa && (previa.sla
          ? <span className="text-foreground flex items-center gap-1"><Timer size={12} className="text-primary" />{editando ? 'Prazos contam desde a abertura' : <>Atendimento até <b>{dataHora(previa.atendimento)}</b> · Solução até <b>{dataHora(previa.solucao)}</b></>}{previa.excecao ? ' (exceção de cliente/categoria)' : ''}</span>
          : <span className="text-muted-foreground">{nivel === 'visita' ? 'Visita não tem SLA' : 'Sem meta de SLA para este nível (Catálogo e SLA)'}</span>)}
      </div>
    </div>
  )
}
