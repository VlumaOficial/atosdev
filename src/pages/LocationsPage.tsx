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
import { MapPin, Plus, Pencil, Trash2, Building2, Power, Clock } from 'lucide-react'
import EnderecoForm from '@/components/EnderecoForm'
import DocumentoReceita, { raizCnpj } from '@/components/DocumentoReceita'
import { erroDocumento } from '@/lib/empresa'
import { formatarRazaoSocial, type DadosReceita } from '@/lib/cnpj'
import { ENDERECO_VAZIO, enderecoDaUnidade, enderecoDaReceita, colunasEndereco, type Endereco } from '@/lib/endereco'
import SemanaEditor from '@/components/calendario/SemanaEditor'
import { resumoSemana, validarSemana, ordenarSemana, MODELOS_SEMANA } from '@/lib/calendario'

const emptyForm: LocationInput = { client_id: '', name: '', address: '', city: '', state: '', cidade_ibge: null, horario_funcionamento: null, documento: '' }

const mapLocation = (row: any): Location => ({ ...row })

const chips = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'inactive', label: 'Inativos' },
]

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
  const [endereco, setEndereco] = useState<Endereco>({ ...ENDERECO_VAZIO })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [chip, setChip] = useState('all')

  const visible = useMemo(() => {
    if (chip === 'active') return items.filter(l => l.active)
    if (chip === 'inactive') return items.filter(l => !l.active)
    return items
  }, [items, chip])

  // filial com CNPJ de outra raiz = provável CNPJ trocado (só avisa)
  const avisoDocumento = useMemo(() => {
    const doCliente = raizCnpj(clients.find(c => c.id === form.client_id)?.cnpj)
    const daUnidade = raizCnpj(form.documento)
    if (!doCliente || !daUnidade || doCliente === daUnidade) return null
    return 'Este CNPJ não é da mesma empresa do cliente (raiz diferente). Confira se é mesmo uma unidade dele.'
  }, [clients, form.client_id, form.documento])

  async function aplicarReceita(r: DadosReceita) {
    setForm(f => ({ ...f, name: f.name.trim() ? f.name : formatarRazaoSocial(r.nomeFantasia || r.razaoSocial) }))
    setEndereco(await enderecoDaReceita(r))
  }

  const clientOptions = useMemo(
    () => clients.map(c => ({ value: c.id, label: c.name })),
    [clients]
  )

  function openNew() {
    setEditing(null)
    setFormActive(true)
    setForm(emptyForm)
    setEndereco({ ...ENDERECO_VAZIO })
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(l: Location) {
    setEditing(l)
    setFormActive(l.active)
    setForm({ client_id: l.client_id, name: l.name, address: l.address, city: l.city, state: l.state,
      cidade_ibge: l.cidade_ibge ?? null, horario_funcionamento: l.horario_funcionamento ?? null, documento: l.documento ?? '' })
    setEndereco(enderecoDaUnidade(l))
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
    const docMudou = (form.documento ?? '').replace(/\D/g, '') !== (editing?.documento ?? '').replace(/\D/g, '')
    const erroDoc = docMudou ? erroDocumento(form.documento ?? '') : null
    if (erroDoc) { setFormError(erroDoc); return }
    if (!endereco.cidade_ibge) {
      setFormError('Informe a UF e a cidade da unidade (usadas nos feriados e no SLA).')
      return
    }
    let horario = form.horario_funcionamento ?? null
    if (horario) {
      const problema = validarSemana(horario)
      if (problema) { setFormError('Horário de funcionamento — ' + problema); return }
      horario = ordenarSemana(horario)
      if (!Object.keys(horario).length) horario = null
    }
    const dados = { client_id: form.client_id, name: form.name, documento: form.documento || null, horario_funcionamento: horario, ...colunasEndereco(endereco) }
    setSaving(true)
    try {
      if (editing) {
        await updateLocation(editing.id, { ...dados, active: formActive } as any)
      } else {
        await createLocation(dados)
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
    if (!confirm(`Excluir a unidade "${l.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteLocation(l.id)
      refetch()
    } catch {
      alert('Não foi possível excluir a unidade.')
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
      header: 'Unidade',
      render: l => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <MapPin size={15} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{l.name}</p>
            {l.documento && <p className="text-xs text-muted-foreground">{l.documento}</p>}
          </div>
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
        l.cidade_ibge
          ? <span className="text-xs text-muted-foreground">{l.city} / {l.state}</span>
          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20" title="Escolha a cidade na lista (feriados e SLA)">sem cidade</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: l => <StatusBadge active={l.active} />,
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
        title="Unidades"
        description="Unidades e endereços dos seus clientes"
        actions={
          <Button onClick={openNew} variant="cta" disabled={noClients}>
            <Plus size={16} /> Nova unidade
          </Button>
        }
      />

      {noClients && !loading && (
        <Card className="p-4 mb-4 text-sm text-muted-foreground">
          Cadastre um cliente antes de adicionar unidades.
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
          items={visible}
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
          chips={chips}
          activeChip={chip}
          onChipChange={setChip}
          columns={columns}
          renderCard={renderCard}
          rowActions={l => <RowActions item={l} />}
          getKey={l => l.id}
          emptyState={
            <Card>
              <EmptyState
                icon={MapPin}
                title="Nenhuma unidade cadastrada"
                description="Adicione unidades e endereços vinculados aos seus clientes."
                action={!noClients ? <Button onClick={openNew} variant="cta"><Plus size={16} /> Nova unidade</Button> : undefined}
              />
            </Card>
          }
        />
      )}

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? 'Editar local' : 'Nova unidade'}
        description={editing ? 'Atualize os dados da unidade' : 'Cadastre uma unidade vinculada a um cliente'}
        className={form.horario_funcionamento ? 'max-w-xl' : 'max-w-lg'}
        fecharAoClicarFora={false}
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
          <DocumentoReceita id="unidade-documento" valor={form.documento ?? ''} aviso={avisoDocumento}
            onChange={v => setForm({ ...form, documento: v })} onReceita={aplicarReceita} />
          <div>
            <Label htmlFor="name">Nome da unidade *</Label>
            <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Loja 01 - Centro" />
          </div>
          <EnderecoForm idPrefixo="unidade" valor={endereco} onChange={setEndereco}
            textoLegado={editing && !editing.logradouro ? [editing.address, editing.city].filter(Boolean).join(', ') || null : null} />

          <div className="rounded-md border border-border px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5"><Clock size={13} /> Horário de funcionamento <span className="text-xs text-muted-foreground font-normal">(opcional)</span></p>
                <p className="text-xs text-muted-foreground">Quando a unidade recebe o técnico (ex.: loja das 10h às 22h). Será usado para avisar quando algo for agendado fora deste horário.</p>
                {form.horario_funcionamento && <p className="text-xs text-foreground mt-1" data-testid="unidade-horario-resumo">{resumoSemana(ordenarSemana(form.horario_funcionamento))}</p>}
              </div>
              <button type="button" onClick={() => setForm({ ...form, horario_funcionamento: form.horario_funcionamento ? null : JSON.parse(JSON.stringify(MODELOS_SEMANA[0].semana)) })}
                className="text-xs text-primary hover:underline flex-shrink-0">
                {form.horario_funcionamento ? 'Remover' : 'Informar'}
              </button>
            </div>
            {form.horario_funcionamento && (
              <div className="mt-3">
                <SemanaEditor valor={form.horario_funcionamento} onChange={s => setForm({ ...form, horario_funcionamento: s })} mostrarModelos={false} />
              </div>
            )}
          </div>

          {editing && (
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">Unidade ativa</p>
                <p className="text-xs text-muted-foreground">Unidades inativas não aparecem nas seleções</p>
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
