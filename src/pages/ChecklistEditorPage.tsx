import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useChecklistTemplate, type TemplateItem, type ResponseType } from '@/hooks/useChecklistTemplate'
import { useClients } from '@/hooks/useClients'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/input'
import { ArrowLeft, Plus, Trash2, GripVertical, X } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const RESPONSE_TYPES: { value: ResponseType; label: string }[] = [
  { value: 'sim_nao', label: 'Sim / Não' },
  { value: 'texto', label: 'Texto livre' },
  { value: 'numero', label: 'Número' },
  { value: 'escolha_unica', label: 'Múltipla escolha (uma)' },
  { value: 'escolha_multipla', label: 'Seleção múltipla (várias)' },
  { value: 'foto', label: 'Foto / anexo' },
  { value: 'data', label: 'Data' },
]

const PRECISA_OPCOES = new Set<ResponseType>(['escolha_unica', 'escolha_multipla'])

function tempId() {
  return 'temp-' + Math.random().toString(36).slice(2, 10)
}

function SortableItem({ item, onChange, onRemove }: {
  item: TemplateItem
  onChange: (patch: Partial<TemplateItem>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-2 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none" title="Arrastar">
          <GripVertical size={16} />
        </button>
        <div className="flex-1 min-w-0 space-y-2">
          <input
            value={item.label}
            onChange={e => onChange({ label: e.target.value })}
            placeholder="Texto do item (ex: Câmera 01 está funcionando?)"
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={item.response_type}
              onChange={e => onChange({ response_type: e.target.value as ResponseType })}
              className="px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            >
              {RESPONSE_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={item.is_required} onChange={e => onChange({ is_required: e.target.checked })} className="accent-primary" />
              Obrigatório
            </label>
          </div>

          {PRECISA_OPCOES.has(item.response_type) && (
            <div className="pl-1 space-y-1.5">
              <p className="text-xs text-muted-foreground">Opções:</p>
              {item.options.map((op, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={op}
                    onChange={e => {
                      const novas = [...item.options]; novas[i] = e.target.value; onChange({ options: novas })
                    }}
                    placeholder={`Opção ${i + 1}`}
                    className="flex-1 px-2.5 py-1.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                  />
                  <button onClick={() => { const novas = item.options.filter((_, j) => j !== i); onChange({ options: novas }) }}
                    className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 transition"><X size={14} /></button>
                </div>
              ))}
              <button onClick={() => onChange({ options: [...item.options, ''] })}
                className="text-xs text-primary flex items-center gap-1 mt-1"><Plus size={12} /> Adicionar opção</button>
            </div>
          )}
        </div>
        <button onClick={onRemove} className="mt-1 w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-secondary transition" title="Remover item">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

export default function ChecklistEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, setData, loading, error, isNew, save } = useChecklistTemplate(id)
  const { clients } = useClients()
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function addItem() {
    const novo: TemplateItem = { id: tempId(), label: '', response_type: 'sim_nao', options: [], is_required: false, position: data.items.length, isNew: true }
    setData({ ...data, items: [...data.items, novo] })
  }

  function updateItem(itemId: string, patch: Partial<TemplateItem>) {
    setData({ ...data, items: data.items.map(it => it.id === itemId ? { ...it, ...patch } : it) })
  }

  function removeItem(itemId: string) {
    setData({ ...data, items: data.items.filter(it => it.id !== itemId) })
  }

  function onDragEnd(event: any) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = data.items.findIndex(i => i.id === active.id)
      const newIndex = data.items.findIndex(i => i.id === over.id)
      setData({ ...data, items: arrayMove(data.items, oldIndex, newIndex) })
    }
  }

  async function handleSave() {
    setFormError('')
    if (!data.name.trim()) { setFormError('Informe o nome do modelo.'); return }
    if (data.items.length === 0) { setFormError('Adicione ao menos um item.'); return }
    for (const it of data.items) {
      if (!it.label.trim()) { setFormError('Todos os itens precisam de um texto.'); return }
      if (PRECISA_OPCOES.has(it.response_type) && it.options.filter(o => o.trim()).length < 2) {
        setFormError('Itens de escolha precisam de ao menos 2 opções.'); return
      }
    }
    setSaving(true)
    try {
      await save(data)
      navigate('/checklists')
    } catch (e: any) {
      setFormError(e?.message ?? 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }
  if (error) {
    return <Card className="p-6 text-center text-red-400 text-sm max-w-lg mx-auto">{error}</Card>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate('/checklists')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition mb-4">
        <ArrowLeft size={16} /> Checklists
      </button>

      <h1 className="text-xl font-semibold text-foreground mb-5">{isNew ? 'Novo modelo' : 'Editar modelo'}</h1>

      <Card className="p-5 mb-4 space-y-4">
        <div>
          <Label htmlFor="name">Nome do modelo *</Label>
          <input id="name" value={data.name} onChange={e => setData({ ...data, name: e.target.value })}
            placeholder="Ex: Manutenção preventiva CFTV"
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
        </div>
        <div>
          <Label htmlFor="desc">Descrição</Label>
          <textarea id="desc" value={data.description} onChange={e => setData({ ...data, description: e.target.value })}
            placeholder="Opcional" rows={2}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none" />
        </div>
        <div>
          <Label htmlFor="client">Cliente</Label>
          <select id="client" value={data.client_id ?? ''} onChange={e => setData({ ...data, client_id: e.target.value || null })}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition">
            <option value="">Geral (toda a empresa)</option>
            {clients.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="text-xs text-muted-foreground mt-1">Deixe "Geral" para usar com qualquer cliente, ou vincule a um cliente específico.</p>
        </div>
      </Card>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">Itens do checklist</h2>
        <Button variant="ghost" onClick={addItem}><Plus size={15} /> Adicionar item</Button>
      </div>

      {data.items.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground mb-4">Nenhum item ainda. Clique em "Adicionar item".</Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={data.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 mb-4">
              {data.items.map(it => (
                <SortableItem key={it.id} item={it} onChange={(patch) => updateItem(it.id, patch)} onRemove={() => removeItem(it.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {formError && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mb-4">{formError}</div>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate('/checklists')}>Cancelar</Button>
        <Button variant="cta" loading={saving} onClick={handleSave}>Salvar modelo</Button>
      </div>
    </div>
  )
}
