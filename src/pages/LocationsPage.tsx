import { useState, useMemo } from 'react'
import { useLocations, type Location, type LocationInput } from '@/hooks/useLocations'
import { useClients } from '@/hooks/useClients'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { Combobox } from '@/components/ui/combobox'
import { DataListView, type Column } from '@/components/ui/data-list-view'
import { MapPin, Plus, Pencil, Trash2, Building2, Power } from 'lucide-react'

const emptyForm: LocationInput = { client_id: '', name: '', address: '', city: '', state: '' }

const mapLocation = (row: any): Location => ({ ...row })

export default function LocationsPage() {
  const { createLocation, updateLocation, deleteLocation, setLocationActive } = useLocations()
  const { clients } = useClients()
  const [clientFilter, setClientFilter] = useState('')

  const {
    items, loading, error, page, pageSize, total, totalPages,
    setPage, setPageSize, search, setSearch, refetch,
  } = usePaginatedQuery<Location>({
    table: 'locations',
    select: '*, client:clients(id, name)',
    searchColumns: ['name', 'city'],
    orderBy: 'name',
    ascending: true,
    initialPageSize: 25,
    mapRow: mapLocation,
    eqFilter: clientFilter ? { column: 'client_id', value: clientFilter } : null,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [form, setForm] = useState<LocationInput>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formActive, setFormActive] = useState(true)

  const clientOptions = useMemo(
    () => clients.map(c => ({ value: c.id, label: c.name })),
    [clients]
  )

  function openNew() {
    setEditing(null)
    setFormActive(true)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(l: Location) {
    setEditing(l)
    setFormActive(l.active)
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
        await updateLocation(editing.id, { ...form, active: formActive } as any)
      } else {
        await createLocation(form)
      }
      setModalOpen(false)
      refetch()
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
      refetch()
    } catch {
      alert('Não foi possível excluir o local.')
    }
  }

  async function handleToggleActive(l: Location) {
    try {
      await setLocationActive(l.id, !l.active)
      refetch()
    } catch {
      alert('Não foi possível alterar o status.')
    }
  }

  function RowActions({ item }: { item: Location }) {
    return (
      <>
        <button onClick={() => openEdit(item)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition">
          <Pencil size={14} />
        </button>
        <button onClick={() => handleToggleActive(item)} title={item.active ? 'Desativar' : 'Ativar'} className={'w-7 h-7 rounded-md flex items-center justify-center transition hover:bg-secondary ' + (item.active ? 'text-muted-foreground hover:text-amber-400' : 'text-green-400 hover:text-green-300')}>
          <Power size={14} />
        </button>
        <button onClick={() => handleDelete(item)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition">
          <Trash2 size={14} />
        </button>
      </>
    )
  }

  const columns: Column<Location>[] = [
    {
      key: 'name',
      header: 'Local',
      render: l => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <MapPin size={15} className="text-primary" />
          </div>
          <p className="font-medium text-foreground truncate">{l.name}</p>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Cliente',
      render: l => (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 size={12} /> {l.client?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'location',
      header: 'Cidade / UF',
      render: l => (
        <span className="text-xs text-muted-foreground">
          {[l.city, l.state].filter(Boolean).join(' / ') || '—'}
        </span>
      ),
    },
  ]

  function renderCard(l: Location) {
    return (
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <MapPin size={18} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{l.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <Building2 size={11} /> {l.client?.name ?? '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <RowActions item={l} />
          </div>
        </div>
        {(l.city || l.state) && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {[l.address, l.city, l.state].filter(Boolean).join(', ')}
            </p>
          </div>
        )}
      </Card>
    )
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

      <div className="mb-4 max-w-xs">
        <Label htmlFor="filter-client">Filtrar por cliente</Label>
        <Combobox
          id="filter-client"
          options={[{ value: '', label: 'Todos os clientes' }, ...clientOptions]}
          value={clientFilter}
          onChange={v => { setClientFilter(v); setPage(1) }}
          placeholder="Todos os clientes"
          searchPlaceholder="Buscar cliente..."
          emptyText="Nenhum cliente encontrado."
        />
      </div>

      {error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : (
        <DataListView<Location>
          items={items}
          loading={loading}
          viewKey="locations"
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nome do local ou cidade..."
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          columns={columns}
          renderCard={renderCard}
          rowActions={l => <RowActions item={l} />}
          getKey={l => l.id}
          emptyState={
            <Card>
              <EmptyState
                icon={MapPin}
                title="Nenhum local cadastrado"
                description="Adicione unidades e endereços vinculados aos seus clientes."
                action={!noClients ? <Button onClick={openNew} variant="cta"><Plus size={16} /> Novo local</Button> : undefined}
              />
            </Card>
          }
        />
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
              options={clientOptions}
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

          {editing && (
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">Local ativo</p>
                <p className="text-xs text-muted-foreground">Locais inativos não aparecem nas seleções</p>
              </div>
              <button type="button" onClick={() => setFormActive(v => !v)} className={'relative w-11 h-6 rounded-full transition ' + (formActive ? 'bg-primary' : 'bg-secondary border border-border')}>
                <span className={'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ' + (formActive ? 'left-[22px]' : 'left-0.5')} />
              </button>
            </div>
          )}

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
