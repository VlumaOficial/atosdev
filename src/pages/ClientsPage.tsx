import { useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useClients, type Client, type ClientInput, type UnidadeResumo } from '@/hooks/useClients'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { DataListView, type Column } from '@/components/ui/data-list-view'
import { Building2, Plus, Pencil, Trash2, MapPin, Power, Search, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Combobox } from '@/components/ui/combobox'
import EnderecoForm from '@/components/EnderecoForm'
import { ENDERECO_VAZIO, enderecoDaUnidade, enderecoDaReceita, type Endereco } from '@/lib/endereco'
import { erroDocumento, mascaraDocumento, cnpjValido } from '@/lib/empresa'
import { consultarCnpjReceita, formatarRazaoSocial, type DadosReceita } from '@/lib/cnpj'

// Cliente = quem a empresa atende (pessoa jurídica ou física). O endereço
// mora na Unidade principal (migration 036): este modal edita a própria
// Unidade principal, na criação e na edição — salvo numa transação só
// (função salvar_cliente).

const NOVA_UNIDADE = '__nova__'

function principalDe(c: Client): UnidadeResumo | null {
  return c.unidades?.find(u => u.is_primary) ?? null
}

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
  const { deleteClient, setClientActive } = useClients()
  const {
    items, loading, error, page, pageSize, total, totalPages,
    setPage, setPageSize, search, setSearch, refetch,
  } = usePaginatedQuery<Client>({
    table: 'clients',
    select: '*, locations(count), unidades:locations(id, name, is_primary, address, city, state, cidade_ibge, cep, logradouro, numero, complemento, bairro)',
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
  const [endereco, setEndereco] = useState<Endereco>({ ...ENDERECO_VAZIO })
  const [principal, setPrincipal] = useState<string>(NOVA_UNIDADE)
  const [receita, setReceita] = useState<DadosReceita | null>(null)
  const [consultando, setConsultando] = useState(false)
  const [erroReceita, setErroReceita] = useState('')

  const visible = useMemo(() => {
    if (chip === 'active') return items.filter(c => c.active)
    if (chip === 'inactive') return items.filter(c => !c.active)
    return items
  }, [items, chip])

  function limparAuxiliares() {
    setFormError(''); setReceita(null); setErroReceita('')
  }

  function openNew() {
    setEditing(null)
    setFormActive(true)
    setForm(emptyForm)
    setEndereco({ ...ENDERECO_VAZIO })
    setPrincipal(NOVA_UNIDADE)
    limparAuxiliares()
    setModalOpen(true)
  }

  function openEdit(c: Client) {
    setEditing(c)
    setFormActive(c.active)
    setForm({ name: c.name, cnpj: c.cnpj ?? '', email: c.email, phone: c.phone, address: c.address })
    const p = principalDe(c)
    setPrincipal(p?.id ?? NOVA_UNIDADE)
    setEndereco(enderecoDaUnidade(p))
    limparAuxiliares()
    setModalOpen(true)
  }

  // cliente sem principal: escolher uma unidade existente ou criar nova
  function escolherPrincipal(id: string) {
    setPrincipal(id)
    const u = editing?.unidades?.find(x => x.id === id)
    setEndereco(u ? enderecoDaUnidade(u) : { ...ENDERECO_VAZIO })
  }

  async function consultarReceita() {
    setErroReceita(''); setReceita(null)
    const doc = form.cnpj ?? ''
    if (!cnpjValido(doc)) { setErroReceita('A consulta à Receita é só para CNPJ válido (14 dígitos).'); return }
    setConsultando(true)
    const r = await consultarCnpjReceita(doc)
    setConsultando(false)
    if ('erro' in r) { setErroReceita(r.erro); return }
    setReceita(r)
    setForm(f => ({
      ...f,
      name: f.name.trim() ? f.name : (r.nomeFantasia ? formatarRazaoSocial(r.nomeFantasia) : formatarRazaoSocial(r.razaoSocial)),
      phone: f.phone?.trim() ? f.phone : r.telefone,
      email: f.email?.trim() ? f.email : r.email,
    }))
    setEndereco(await enderecoDaReceita(r))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('O nome do cliente é obrigatório.')
      return
    }
    const docMudou = (form.cnpj ?? '').replace(/\D/g, '') !== (editing?.cnpj ?? '').replace(/\D/g, '')
    const erroDoc = docMudou ? erroDocumento(form.cnpj ?? '') : null
    if (erroDoc) { setFormError(erroDoc); return }
    if (!endereco.cidade_ibge) {
      setFormError('Informe a UF e a cidade do endereço principal (usadas nos feriados e no SLA).')
      return
    }
    setSaving(true)
    const { error } = await supabase.rpc('salvar_cliente', {
      p_id: editing?.id ?? null,
      p_nome: form.name,
      p_documento: form.cnpj ?? '',
      p_email: form.email ?? '',
      p_telefone: form.phone ?? '',
      p_ativo: editing ? formActive : true,
      p_principal: principal === NOVA_UNIDADE ? null : principal,
      p_endereco: {
        cep: endereco.cep, logradouro: endereco.logradouro, numero: endereco.numero,
        complemento: endereco.complemento, bairro: endereco.bairro,
        cidade_ibge: endereco.cidade_ibge, cidade: endereco.cidade,
      },
    })
    setSaving(false)
    if (error) { setFormError(error.message || 'Não foi possível salvar. Tente novamente.'); return }
    setModalOpen(false)
    refetch()
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
      key: 'cidade',
      header: 'Cidade',
      render: c => <CidadeCliente c={c} />,
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
      header: 'Unidades',
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
            <MapPin size={12} /> {c.locations_count ?? 0} {(c.locations_count ?? 0) === 1 ? 'unidade' : 'unidades'}
          </span>
          <CidadeCliente c={c} />
          <StatusBadge active={c.active} />
        </div>
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Quem a sua empresa atende — empresas ou pessoas"
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
          searchPlaceholder="Buscar por nome, CPF/CNPJ ou e-mail..."
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
        className="max-w-lg"
        fecharAoClicarFora={false}
        description={editing ? 'Atualize os dados do cliente' : 'Cadastre uma empresa ou pessoa atendida'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome da empresa ou da pessoa" />
          </div>
          <div>
            <Label htmlFor="cnpj">CPF ou CNPJ</Label>
            <div className="flex gap-2">
              <Input id="cnpj" value={form.cnpj ?? ''} inputMode="numeric" placeholder="000.000.000-00 ou 00.000.000/0000-00"
                onChange={e => { setForm({ ...form, cnpj: mascaraDocumento(e.target.value) }); setReceita(null); setErroReceita('') }} />
              <Button type="button" variant="outline" onClick={consultarReceita} disabled={consultando || (form.cnpj ?? '').replace(/\D/g, '').length !== 14}
                title="Preenche nome, contato e endereço com os dados da Receita Federal (só CNPJ)">
                {consultando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Receita
              </Button>
            </div>
            {erroReceita && <p className="text-xs text-red-400 mt-1">{erroReceita}</p>}
            {receita && (
              <div className={'mt-2 rounded-md border px-3 py-2 text-xs ' + (receita.ativa ? 'border-green-500/30 bg-green-500/5 text-green-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-300')} data-testid="cliente-receita">
                <p className="flex items-center gap-1.5 font-medium">{receita.ativa ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {formatarRazaoSocial(receita.razaoSocial)} — {receita.situacao}</p>
                <p className="text-muted-foreground mt-0.5">Endereço e contatos vazios foram preenchidos com os dados da Receita. Confira antes de salvar.</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={form.email ?? ''} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contato@empresa.com" />
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(71) 90000-0000" />
            </div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Endereço principal</p>
              <p className="text-xs text-muted-foreground">Fica guardado na unidade principal do cliente — as outras unidades são cadastradas em Unidades.</p>
            </div>
            {editing && !principalDe(editing) && (editing.unidades?.length ?? 0) > 0 && (
              <div>
                <Label htmlFor="principal">Unidade principal</Label>
                <Combobox id="principal" value={principal} onChange={escolherPrincipal}
                  options={[...(editing.unidades ?? []).map(u => ({ value: u.id, label: u.name })), { value: NOVA_UNIDADE, label: '+ Nova unidade com o endereço abaixo' }]}
                  placeholder="Escolha a unidade principal" searchPlaceholder="Buscar unidade..." />
                <p className="text-[11px] text-amber-300 mt-1">Este cliente ainda não tem unidade principal. Escolha uma das unidades existentes ou crie uma nova.</p>
              </div>
            )}
            {editing && principalDe(editing) && (
              <p className="text-xs text-muted-foreground">Unidade principal: <span className="text-foreground">{principalDe(editing)!.name}</span></p>
            )}
            <EnderecoForm idPrefixo="cliente" valor={endereco} onChange={setEndereco}
              textoLegado={principal !== NOVA_UNIDADE ? editing?.unidades?.find(u => u.id === principal)?.address : (editing?.address || null)} />
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

function CidadeCliente({ c }: { c: Client }) {
  const p = principalDe(c)
  if (p?.cidade_ibge) return <span className="whitespace-nowrap text-xs text-muted-foreground">{p.city} - {p.state}</span>
  if (!p) return <span className="whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20" title="Edite o cliente e escolha a unidade principal">sem unidade principal</span>
  return <span className="whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20" title="Informe a cidade no endereço principal (feriados e SLA)">sem cidade</span>
}
