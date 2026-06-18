import { useState } from 'react'
import { useTechnicians, type Technician, type TechnicianInput } from '@/hooks/useTechnicians'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { DataListView, type Column } from '@/components/ui/data-list-view'
import { Wrench, Plus, Pencil, Power, Mail, Phone, Eye, EyeOff } from 'lucide-react'

const emptyForm: TechnicianInput = { name: '', email: '', password: '', phone: '' }

const chips = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'inactive', label: 'Inativos' },
]

export default function TechniciansPage() {
  const { technicians, loading, error, createTechnician, updateTechnician, setTechnicianActive } = useTechnicians()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Technician | null>(null)
  const [form, setForm] = useState<TechnicianInput>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [chip, setChip] = useState('all')
  const [showPassword, setShowPassword] = useState(false)
  const [query, setQuery] = useState('')

  const visible = technicians.filter(t => {
    if (chip === 'active' && !t.active) return false
    if (chip === 'inactive' && t.active) return false
    if (query.trim()) {
      const q = query.toLowerCase()
      return `${t.name} ${t.email} ${t.phone ?? ''}`.toLowerCase().includes(q)
    }
    return true
  })

  function openNew() {
    setEditing(null)
    setForm({ name: '', email: '', password: '', phone: '' })
    setFormError('')
    setShowPassword(false)
    setModalOpen(true)
  }

  function openEdit(t: Technician) {
    setEditing(t)
    setForm({ name: t.name, email: t.email, password: '', phone: t.phone })
    setFormError('')
    setShowPassword(false)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setForm({ name: '', email: '', password: '', phone: '' })
    setEditing(null)
    setShowPassword(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('O nome do técnico é obrigatório.')
      return
    }
    if (!editing) {
      if (!form.email.trim()) {
        setFormError('O e-mail é obrigatório.')
        return
      }
      if (form.password.length < 6) {
        setFormError('A senha provisória deve ter ao menos 6 caracteres.')
        return
      }
    }
    setSaving(true)
    try {
      if (editing) {
        await updateTechnician(editing.id, { name: form.name, phone: form.phone })
      } else {
        await createTechnician(form)
      }
      closeModal()
    } catch (err: any) {
      setFormError(err?.message ?? 'Não foi possível salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(t: Technician) {
    try {
      await setTechnicianActive(t.id, !t.active)
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

  function RowActions({ item }: { item: Technician }) {
    return (
      <>
        <button onClick={() => openEdit(item)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition">
          <Pencil size={14} />
        </button>
        <button onClick={() => handleToggleActive(item)} title={item.active ? 'Desativar' : 'Ativar'} className={'w-7 h-7 rounded-md flex items-center justify-center transition hover:bg-secondary ' + (item.active ? 'text-muted-foreground hover:text-amber-400' : 'text-green-400 hover:text-green-300')}>
          <Power size={14} />
        </button>
      </>
    )
  }

  const columns: Column<Technician>[] = [
    {
      key: 'name',
      header: 'Técnico',
      render: t => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Wrench size={15} className="text-primary" />
          </div>
          <p className="font-medium text-foreground truncate">{t.name}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contato',
      render: t => (
        <div className="text-xs text-muted-foreground">
          <p className="truncate flex items-center gap-1.5"><Mail size={11} /> {t.email}</p>
          {t.phone && <p className="flex items-center gap-1.5 mt-0.5"><Phone size={11} /> {t.phone}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: t => <StatusBadge active={t.active} />,
    },
  ]

  function renderCard(t: Technician) {
    return (
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Wrench size={18} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{t.name}</p>
              <p className="text-xs text-muted-foreground truncate">{t.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <RowActions item={t} />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          {t.phone ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone size={11} /> {t.phone}</span>
          ) : <span className="text-xs text-muted-foreground">—</span>}
          <StatusBadge active={t.active} />
        </div>
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title="Técnicos"
        description="Equipe de campo que executa as ordens de serviço"
        actions={
          <Button onClick={openNew} variant="cta">
            <Plus size={16} /> Novo técnico
          </Button>
        }
      />

      {error ? (
        <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
      ) : (
        <DataListView<Technician>
          items={visible}
          loading={loading}
          viewKey="technicians"
          search={query}
          onSearchChange={setQuery}
          searchPlaceholder="Buscar por nome, e-mail ou telefone..."
          page={1}
          pageSize={visible.length || 1}
          total={visible.length}
          totalPages={1}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
          pageSizeOptions={[visible.length || 1]}
          chips={chips}
          activeChip={chip}
          onChipChange={setChip}
          columns={columns}
          renderCard={renderCard}
          rowActions={t => <RowActions item={t} />}
          getKey={t => t.id}
          emptyState={
            <Card>
              <EmptyState
                icon={Wrench}
                title="Nenhum técnico cadastrado"
                description="Cadastre os técnicos da sua equipe de campo para atribuir ordens de serviço."
                action={<Button onClick={openNew} variant="cta"><Plus size={16} /> Novo técnico</Button>}
              />
            </Card>
          }
        />
      )}

      <Modal
        open={modalOpen}
        onOpenChange={(o) => { if (!o) closeModal(); else setModalOpen(true) }}
        title={editing ? 'Editar técnico' : 'Novo técnico'}
        description={editing ? 'Atualize os dados do técnico' : 'Cadastre um técnico da equipe de campo'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="email">E-mail {editing ? '' : '*'}</Label>
            <Input id="email" type="email" value={form.email} disabled={!!editing} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="tecnico@email.com" autoComplete="off" />
            {editing && <p className="text-xs text-muted-foreground mt-1">O e-mail não pode ser alterado.</p>}
          </div>
          {!editing && (
            <div>
              <Label htmlFor="password">Senha provisória *</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" className="pr-10" autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">O técnico poderá trocar a senha depois pelo "Esqueci a senha".</p>
            </div>
          )}
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(71) 90000-0000" autoComplete="off" />
          </div>

          {formError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{formError}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" variant="cta" loading={saving}>{editing ? 'Salvar' : 'Cadastrar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
