import { useState } from 'react'
import { useLocations, type Location, type LocationInput } from '@/hooks/useLocations'
import { useClients } from '@/hooks/useClients'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { Combobox } from '@/components/ui/combobox'
import { MapPin, Plus, Pencil, Trash2, Building2 } from 'lucide-react'

const emptyForm: LocationInput = { client_id: '', name: '', address: '', city: '', state: '' }

export default function LocationsPage() {
  const { locations, loading, error, createLocation, updateLocation, deleteLocation } = useLocations()
  const { clients } = useClients()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [form, setForm] = useState<LocationInput>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(l: Location) {
    setEditing(l)
    setForm({ client_id: l.client_id, name: l.name, address: l.address, city: l.city, state: l.state })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.client_id) {
      setFormError('Selecione o cliente ao qual o local pertence.')
      return
    }
    if (!form.name.trim()) {
      setFormError('O nome do local é obrigatório.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updateLocation(editing.id, form)
      } else {
        await createLocation(form)
      }
      setModalOpen(false)
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(l: Location) {
    if (!confirm(`Excluir o local "${l.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteLocation(l.id)
    } catch {
      alert('Não foi possível excluir o local.')
    }
  }

  const noClients = clients.length === 0

  return (
    <div>
      <PageHeader
        title="Locais"
        description="Unidades e endereços dos seus clientes"
        actions={
          <Button onClick={openNew} variant="cta" disabled={noClients}>
            <Plus size={16} /> Novo local
          </Button>
        }
      />

      {noClients && !loading && (
        <Card className="p-4 mb-4 text-sm text-muted-foreground">
          Cadastre um cliente antes de adicionar locais.
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : locations.length === 0 ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title="Nenhum local cadastrado"
            description="Adicione unidades e endereços vinculados aos seus clientes."
            action={!noClients ? <Button onClick={openNew} variant="cta"><Plus size={16} /> Novo local</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map(l => (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <MapPin size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <Building2 size={11} /> {l.client?.name ?? 'Cliente'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(l)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(l)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {(l.address || l.city || l.state) && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    {[l.address, l.city, l.state].filter(Boolean).join(', ')}
                  </p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? 'Editar local' : 'Novo local'}
        description={editing ? 'Atualize os dados do local' : 'Cadastre uma unidade vinculada a um cliente'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="client">Cliente *</Label>
            <Combobox
              id="client"
              options={clients.map(c => ({ value: c.id, label: c.name }))}
              value={form.client_id}
              onChange={v => setForm({ ...form, client_id: v })}
              placeholder="Selecione o cliente"
              searchPlaceholder="Buscar cliente..."
              emptyText="Nenhum cliente encontrado."
            />
          </div>
          <div>
            <Label htmlFor="name">Nome do local *</Label>
            <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Loja 01 - Centro" />
          </div>
          <div>
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" value={form.address ?? ''} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" value={form.city ?? ''} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Cidade" />
            </div>
            <div>
              <Label htmlFor="state">Estado</Label>
              <Input id="state" value={form.state ?? ''} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="UF" />
            </div>
          </div>

          {formError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{formError}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="cta" loading={saving}>{editing ? 'Salvar' : 'Cadastrar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
