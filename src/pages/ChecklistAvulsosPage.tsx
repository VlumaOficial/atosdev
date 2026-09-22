import { useState, useMemo } from 'react'
import { useChecklistAvulsos, type ChecklistAvulsoInput } from '@/hooks/useChecklistAvulsos'
import { useChecklistTemplates } from '@/hooks/useChecklistTemplates'
import { useClients } from '@/hooks/useClients'
import { useLocations } from '@/hooks/useLocations'
import { useTechnicians } from '@/hooks/useTechnicians'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { Combobox } from '@/components/ui/combobox'
import { MultiCombobox } from '@/components/ui/multi-combobox'
import { ClipboardCheck, Plus, Trash2, Building2, MapPin, Users } from 'lucide-react'

const emptyForm: ChecklistAvulsoInput = { template_id: '', title: '', client_id: '', location_id: '', recurrence: '', technician_ids: [] }

const STATUS_LABELS: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído' }
const STATUS_STYLES: Record<string, string> = {
  pendente: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  em_andamento: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  concluido: 'text-green-400 bg-green-500/10 border-green-500/30',
}

const statusChips = [
  { key: 'all', label: 'Todos' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'concluido', label: 'Concluídos' },
]

export default function ChecklistAvulsosPage() {
  const { checklists, loading, error, createChecklistAvulso, deleteChecklistAvulso } = useChecklistAvulsos()
  const { templates } = useChecklistTemplates()
  const { clients } = useClients()
  const { technicians } = useTechnicians()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ChecklistAvulsoInput>(emptyForm)
  const { locations: formLocations } = useLocations(form.client_id || undefined)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [chip, setChip] = useState('all')
  const [toDelete, setToDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const clientOptions = useMemo(() => clients.map(c => ({ value: c.id, label: c.name })), [clients])
  // useLocations(undefined) busca TODAS as unidades do tenant — só mostramos
  // opções depois que um cliente é escolhido (mesmo comportamento do placeholder)
  const locationOptions = useMemo(() => (form.client_id ? formLocations.map(l => ({ value: l.id, label: l.name })) : []), [formLocations, form.client_id])
  const templateOptions = useMemo(() => templates.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name })), [templates])
  const technicianOptions = useMemo(() => technicians.filter(t => t.active).map(t => ({ value: t.id, label: t.name })), [technicians])

  const visible = useMemo(() => {
    if (chip === 'all') return checklists
    return checklists.filter(c => c.status === chip)
  }, [checklists, chip])

  function openNew() {
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setForm(emptyForm)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.template_id) { setFormError('Selecione o modelo de checklist.'); return }
    if (!form.title.trim()) { setFormError('O título é obrigatório.'); return }
    setSaving(true)
    try {
      await createChecklistAvulso(form)
      closeModal()
    } catch (err: any) {
      setFormError(err?.message ?? 'Não foi possível criar o checklist.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteChecklistAvulso(toDelete.id)
      setToDelete(null)
    } catch {
      alert('Não foi possível excluir o checklist.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Checklists avulsos"
        description="Vistorias e inspeções independentes de uma Ordem de Serviço"
        actions={<Button onClick={openNew} variant="cta"><Plus size={16} /> Novo checklist</Button>}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {statusChips.map(c => (
          <button key={c.key} onClick={() => setChip(c.key)}
            className={'px-3 py-1.5 rounded-full text-xs font-medium border transition ' + (chip === c.key ? 'bg-primary/10 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-border hover:text-foreground')}>
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {loading ? 'Carregando...' : `${visible.length} ${visible.length === 1 ? 'checklist' : 'checklists'}`}
      </p>

      {error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            title="Nenhum checklist avulso"
            description="Crie o primeiro checklist independente de uma OS — vistoria, inspeção ou levantamento."
            action={<Button onClick={openNew} variant="cta"><Plus size={16} /> Novo checklist</Button>}
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {visible.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">{c.title_snapshot}</span>
                  <span className={'inline-block px-2 py-0.5 rounded-md text-xs font-medium border ' + STATUS_STYLES[c.status]}>{STATUS_LABELS[c.status]}</span>
                  {c.recurrence && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{c.recurrence}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                  {c.client?.name ? <span className="flex items-center gap-1"><Building2 size={11} /> {c.client.name}</span> : <span>Geral</span>}
                  {c.location?.name && <span className="flex items-center gap-1"><MapPin size={11} /> {c.location.name}</span>}
                  <span className="flex items-center gap-1">
                    <Users size={11} /> {c.targets && c.targets.length > 0 ? c.targets.map(t => t.technician.name).join(', ') : 'Sem técnico'}
                  </span>
                </div>
              </div>
              <button onClick={() => setToDelete({ id: c.id, title: c.title_snapshot })} title="Excluir" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-secondary transition flex-shrink-0"><Trash2 size={15} /></button>
            </div>
          ))}
        </Card>
      )}

      <Modal open={modalOpen} onOpenChange={(o) => { if (!o) closeModal(); else setModalOpen(true) }}
        title="Novo checklist avulso" description="Vistoria ou inspeção sem vínculo com uma OS">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="title">Título *</Label>
            <Input id="title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Vistoria mensal - Loja Centro" />
          </div>
          <div>
            <Label htmlFor="template">Modelo de checklist *</Label>
            <Combobox id="template" options={templateOptions} value={form.template_id} onChange={v => setForm({ ...form, template_id: v })} placeholder="Selecione o modelo" searchPlaceholder="Buscar modelo..." emptyText="Nenhum modelo ativo." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="client">Cliente</Label>
              <Combobox id="client" options={clientOptions} value={form.client_id ?? ''} onChange={v => setForm({ ...form, client_id: v, location_id: '' })} placeholder="Geral (sem cliente)" searchPlaceholder="Buscar cliente..." emptyText="Nenhum cliente encontrado." />
            </div>
            <div>
              <Label htmlFor="location">Unidade</Label>
              <Combobox id="location" options={locationOptions} value={form.location_id ?? ''} onChange={v => setForm({ ...form, location_id: v })} placeholder={form.client_id ? 'Selecione a unidade' : 'Escolha o cliente primeiro'} searchPlaceholder="Buscar unidade..." emptyText="Nenhuma unidade para este cliente." />
            </div>
          </div>
          <div>
            <Label htmlFor="technicians">Técnicos responsáveis</Label>
            <MultiCombobox id="technicians" options={technicianOptions} value={form.technician_ids} onChange={v => setForm({ ...form, technician_ids: v })} placeholder="Nenhum técnico selecionado" searchPlaceholder="Buscar técnico..." emptyText="Nenhum técnico encontrado." />
            {form.technician_ids.length === 0 && <p className="text-xs text-muted-foreground mt-1">Sem técnico atribuído, o checklist só aparece aqui no painel.</p>}
          </div>
          <div>
            <Label htmlFor="recurrence">Recorrência</Label>
            <Input id="recurrence" value={form.recurrence ?? ''} onChange={e => setForm({ ...form, recurrence: e.target.value })} placeholder="Ex: mensal, semanal (opcional)" />
          </div>

          {formError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{formError}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" variant="cta" loading={saving}>Criar checklist</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null) }} title="Excluir checklist" description={toDelete ? `Tem certeza que deseja excluir "${toDelete.title}"? Esta ação não pode ser desfeita.` : ''}>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setToDelete(null)}>Cancelar</Button>
          <Button variant="cta" loading={deleting} onClick={confirmDelete}>Excluir</Button>
        </div>
      </Modal>
    </div>
  )
}
