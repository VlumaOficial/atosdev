import { useState, useMemo, useCallback } from 'react'
import { useClients, type Client, type ClientInput } from '@/hooks/useClients'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { DataListView, type Column } from '@/components/ui/data-list-view'
import { Building2, Plus, Pencil, Trash2, MapPin, Power } from 'lucide-react'

const emptyForm: ClientInput = { name: '', cnpj: '', email: '', phone: '', address: '' }

const chips = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'inactive', label: 'Inativos' },
]

const mapClient = (row: any): Client => ({
  ...row,
  locations_count: row.locations?.[0]?.count ?? 0,
})

export default function ClientsPage() {
  const { createClient, updateClient, deleteClient, setClientActive } = useClients()
  const {
    items, loading, error, page, pageSize, total, totalPages,
    setPage, setPageSize, search, setSearch, refetch,
  } = usePaginatedQuery<Client>({
    table: 'clients',
    select: '*, locations(count)',
    searchColumns: ['name', 'cnpj', 'email'],
    orderBy: 'name',
    ascending: true,
    initialPageSize: 25,
    mapRow: mapClient,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState<ClientInput>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [chip, setChip] = useState('all')

  const visible = useMemo(() => {
    if (chip === 'active') return items.filter(c => c.active)
    if (chip === 'inactive') return items.filter(c => !c.active)
    return items
  }, [items, chip])

  function openNew() {
    setEditing(null)
    setFormActive(true)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(c: Client) {
    setEditing(c)
    setFormActive(c.active)
    setForm({ name: c.name, cnpj: c.cnpj, email: c.email, phone: c.phone, address: c.address })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('O nome do cliente é obrigatório.')
      return
    }
    if (!form.address?.trim()) {
      setFormError('O endereço é obrigatório. Ele define a unidade principal do cliente.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updateClient(editing.id, { ...form, active: formActive } as any)
      } else {
        await createClient(form)
      }
      setModalOpen(false)
      refetch()
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = useCallback(async (c: Client) => {
    if (!confirm(`Excluir o cliente "${c.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteClient(c.id)
      refetch()
    } catch {
      alert('Não foi possível excluir o cliente.')
    }
  }, [deleteClient, refetch])

  async function handleToggleActive(c: Client) {
    try {
      await setClientActive(c.id, !c.active)
      refetch()
    } catch {
      alert('Não foi possível alterar o status.')
    }
  }

  function StatusBadge({ active }: { active: boolean }) {
    return (
      <span className={'inline-flex items-center gap-1.5 text-xs ' + (active ? 'text-green-400' : 'text-muted-foreground')}>
        <span className={'w-1.5 h-1.5 rounded-full ' + (active ? 'bg-green-400' : 'bg-muted-foreground')} />
        {active ? 'Ativo' : 'Inativo'}
      </span>
    )
  }

  function RowActions({ item }: { item: Client }) {
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

  const columns: Column<Client>[] = [
    {
      key: 'name',
      header: 'Cliente',
      render: c => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Building2 size={15} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{c.name}</p>
            {c.cnpj && <p className="text-xs text-muted-foreground">{c.cnpj}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contato',
      render: c => (
        <div className="text-xs text-muted-foreground">
          {c.email && <p className="truncate">{c.email}</p>}
          {c.phone && <p>{c.phone}</p>}
          {!c.email && !c.phone && <span>—</span>}
        </div>
      ),
    },
    {
      key: 'locations',
      header: 'Locais',
      render: c => (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin size={12} /> {c.locations_count ?? 0}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: c => <StatusBadge active={c.active} />,
    },
  ]

  function renderCard(c: Client) {
    return (
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Building2 size={18} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{c.name}</p>
              {c.cnpj && <p className="text-xs text-muted-foreground">{c.cnpj}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <RowActions item={c} />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin size={12} /> {c.locations_count ?? 0} {(c.locations_count ?? 0) === 1 ? 'local' : 'locais'}
          </span>
          <StatusBadge active={c.active} />
        </div>
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Empresas atendidas pela sua operação"
        actions={
          <Button onClick={openNew} variant="cta">
            <Plus size={16} /> Novo cliente
          </Button>
        }
      />

      {error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : (
        <DataListView<Client>
          items={visible}
          loading={loading}
          viewKey="clients"
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nome, CNPJ ou e-mail..."
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          chips={chips}
          activeChip={chip}
          onChipChange={setChip}
          columns={columns}
          renderCard={renderCard}
          rowActions={c => <RowActions item={c} />}
          getKey={c => c.id}
          emptyState={
            <Card>
              <EmptyState
                icon={Building2}
                title="Nenhum cliente cadastrado"
                description="Cadastre o primeiro cliente para começar a organizar seus atendimentos."
                action={<Button onClick={openNew} variant="cta"><Plus size={16} /> Novo cliente</Button>}
              />
            </Card>
          }
        />
      )}

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? 'Editar cliente' : 'Novo cliente'}
        description={editing ? 'Atualize os dados do cliente' : 'Cadastre uma nova empresa atendida'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome da empresa" />
          </div>
          <div>
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input id="cnpj" value={form.cnpj ?? ''} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={form.email ?? ''} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contato@empresa.com" />
          </div>
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(71) 90000-0000" />
          </div>
          <div>
            <Label htmlFor="address">Endereço *</Label>
            <Input id="address" value={form.address ?? ''} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro, cidade — vira a unidade principal" />
            <p className="text-xs text-muted-foreground mt-1">Este endereço será cadastrado como a unidade principal do cliente.</p>
          </div>

          {editing && (
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">Cliente ativo</p>
                <p className="text-xs text-muted-foreground">Clientes inativos não aparecem nas seleções</p>
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
