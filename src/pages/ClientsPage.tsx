import { useState } from 'react'
import { useClients, type Client, type ClientInput } from '@/hooks/useClients'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { Building2, Plus, Pencil, Trash2, Mail, Phone } from 'lucide-react'

const emptyForm: ClientInput = { name: '', cnpj: '', email: '', phone: '', address: '' }

export default function ClientsPage() {
  const { clients, loading, error, createClient, updateClient, deleteClient } = useClients()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState<ClientInput>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(c: Client) {
    setEditing(c)
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
    setSaving(true)
    try {
      if (editing) {
        await updateClient(editing.id, form)
      } else {
        await createClient(form)
      }
      setModalOpen(false)
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: Client) {
    if (!confirm(`Excluir o cliente "${c.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteClient(c.id)
    } catch {
      alert('Não foi possível excluir o cliente.')
    }
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

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Nenhum cliente cadastrado"
            description="Cadastre o primeiro cliente para começar a organizar seus atendimentos."
            action={<Button onClick={openNew} variant="cta"><Plus size={16} /> Novo cliente</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(c => (
            <Card key={c.id} className="p-4">
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
                  <button onClick={() => openEdit(c)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(c)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {(c.email || c.phone) && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {c.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Mail size={12} /> {c.email}
                    </p>
                  )}
                  {c.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Phone size={12} /> {c.phone}
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
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
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" value={form.address ?? ''} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro, cidade" />
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
