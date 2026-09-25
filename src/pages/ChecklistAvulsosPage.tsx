import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useListaAvulsos, useChecklistSeries, createChecklistAvulso, deleteChecklistAvulso, type ChecklistAvulso, type ChecklistSerie } from '@/hooks/useChecklistAvulsos'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { DataListView, type Column } from '@/components/ui/data-list-view'
import FiltrosLista from '@/components/FiltrosLista'
import { intervaloDoPeriodo, type ChavePeriodo } from '@/lib/periodo'
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
import RecorrenciaCampo, { AvisoData } from '@/components/RecorrenciaCampo'
import {
  hojeNoFuso, somarDias, dataCurtaDia, dataBR, situacaoOcorrencia, resumoRecorrencia, regraParaRRule, textoPrazo,
  type Recorrencia,
} from '@/lib/recorrencia'
import { cn } from '@/lib/utils'
import { ClipboardCheck, Plus, Trash2, Building2, MapPin, Users, Repeat, CalendarDays, Pencil, Pause, Play, Square, CalendarClock, ListFilter } from 'lucide-react'

// Checklists avulsos (sem OS) + recorrência (migration 038, desenho
// aprovado 2026-09-25). Aba "Checklists" = ocorrências (o que o técnico
// preenche); aba "Recorrências" = as séries que geram as ocorrências.

const STATUS_LABELS: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído' }
const STATUS_STYLES: Record<string, string> = {
  pendente: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  em_andamento: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  concluido: 'text-green-400 bg-green-500/10 border-green-500/30',
  atrasado: 'text-red-400 bg-red-500/10 border-red-500/30',
}
const SITUACAO_SERIE: Record<string, [string, string]> = {
  ativa: ['Ativa', 'text-green-400 bg-green-500/10 border-green-500/30'],
  pausada: ['Pausada', 'text-amber-400 bg-amber-500/10 border-amber-500/30'],
  encerrada: ['Encerrada', 'text-muted-foreground bg-secondary border-border'],
}

interface Form {
  template_id: string
  title: string
  client_id: string
  location_id: string
  technician_ids: string[]
  inicio: string
  prazo_dias: string
  recorrencia: Recorrencia | null
  a_partir: string
}

export default function ChecklistAvulsosPage() {
  const { tenant } = useAuth()
  const hoje = hojeNoFuso(tenant?.fuso_horario)
  // filtros + página guardados na URL (voltar/compartilhar mantém a lista)
  const { valores: f, definir, limpar } = useFiltrosUrl({
    aba: 'checklists', sit: 'aberto', q: '', per: '', de: '', ate: '', cli: '', uni: '', tec: '', mod: '', serie: '', pag: '1', tam: '25',
  })
  const periodo = intervaloDoPeriodo(f.per as ChavePeriodo, hoje, f.de, f.ate)
  const pagina = Math.max(1, parseInt(f.pag) || 1)
  const tamanho = parseInt(f.tam) || 25
  const { itens, total, contagens, loading, error, recarregar: recarregarLista } = useListaAvulsos({
    situacao: f.sit, q: f.q, de: periodo.de, ate: periodo.ate, cliente: f.cli, unidade: f.uni, tecnico: f.tec, modelo: f.mod, serie: f.serie,
  }, pagina, tamanho)
  const { series, fetchSeries } = useChecklistSeries()
  const { locations: todasUnidades } = useLocations()
  // busca com atraso (não consulta a cada tecla)
  const [busca, setBusca] = useState(f.q)
  useEffect(() => { setBusca(f.q) }, [f.q])
  useEffect(() => {
    if (busca === f.q) return
    const t = setTimeout(() => definir({ q: busca.trim() }), 350)
    return () => clearTimeout(t)
  }, [busca]) // eslint-disable-line react-hooks/exhaustive-deps
  const { templates } = useChecklistTemplates()
  const { clients } = useClients()
  const { technicians } = useTechnicians()

  const vazio = (): Form => ({ template_id: '', title: '', client_id: '', location_id: '', technician_ids: [], inicio: hoje, prazo_dias: '1', recorrencia: null, a_partir: hoje })
  const aba = f.aba as 'checklists' | 'recorrencias'
  const setAba = (a: 'checklists' | 'recorrencias') => definir({ aba: a })
  const [modalOpen, setModalOpen] = useState(false)
  const [editSerie, setEditSerie] = useState<ChecklistSerie | null>(null)
  const [form, setForm] = useState<Form>(vazio)
  const { locations: formLocations } = useLocations(form.client_id || undefined)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [toDelete, setToDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [erroAcao, setErroAcao] = useState('')

  const clientOptions = useMemo(() => clients.map(c => ({ value: c.id, label: c.name })), [clients])
  const locationOptions = useMemo(() => (form.client_id ? formLocations.map(l => ({ value: l.id, label: l.name })) : []), [formLocations, form.client_id])
  const templateOptions = useMemo(() => templates.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name })), [templates])
  const technicianOptions = useMemo(() => technicians.filter(t => t.active).map(t => ({ value: t.id, label: t.name })), [technicians])
  const nomeTecnico = (id: string) => technicians.find(t => t.id === id)?.name ?? '—'

  const situacao = (c: ChecklistAvulso) => c.situacao ?? situacaoOcorrencia(c, hoje)
  const cont = (k: keyof NonNullable<typeof contagens>) => contagens ? ` (${contagens[k]})` : ''
  const chips = [
    { key: 'aberto', label: 'Em aberto' + cont('aberto') },
    { key: 'atrasado', label: 'Atrasados' + cont('atrasado') },
    { key: 'hoje', label: 'Hoje' + cont('hoje') },
    { key: 'proximo', label: 'Próximos' + cont('proximo') },
    { key: 'em_andamento', label: 'Em andamento' + cont('em_andamento') },
    { key: 'concluido', label: 'Concluídos' + cont('concluido') },
    { key: 'todos', label: 'Todos' + cont('todos') },
  ]
  const unidadesFiltro = useMemo(() => todasUnidades.filter(l => !f.cli || l.client_id === f.cli)
    .map(l => ({ value: l.id, label: f.cli ? l.name : `${l.name} — ${l.client?.name ?? ''}` })), [todasUnidades, f.cli])
  const camposFiltro = [
    { chave: 'cli', rotulo: 'Cliente', opcoes: clientOptions, vazio: 'Todos os clientes' },
    { chave: 'uni', rotulo: 'Unidade', opcoes: unidadesFiltro, vazio: 'Todas as unidades' },
    { chave: 'tec', rotulo: 'Técnico', opcoes: technicians.map(t => ({ value: t.id, label: t.name })), vazio: 'Todos os técnicos' },
    { chave: 'mod', rotulo: 'Modelo', opcoes: templates.map(t => ({ value: t.id, label: t.name })), vazio: 'Todos os modelos' },
    { chave: 'serie', rotulo: 'Recorrência', opcoes: series.map(x => ({ value: x.id, label: `${x.titulo} — ${x.resumo}` })), vazio: 'Todas' },
  ]

  function recarregar() { recarregarLista(); fetchSeries() }

  function openNew() {
    setEditSerie(null)
    setForm(vazio())
    setFormError('')
    setModalOpen(true)
  }

  function openEditSerie(s: ChecklistSerie) {
    setEditSerie(s)
    setForm({
      template_id: s.template_id, title: s.titulo, client_id: s.client_id ?? '', location_id: s.location_id ?? '',
      technician_ids: s.tecnicos ?? [], inicio: s.inicio, prazo_dias: String(s.prazo_dias),
      recorrencia: { regra: s.regra, termino_tipo: s.termino_tipo, termino_qtd: s.termino_qtd, termino_data: s.termino_data },
      a_partir: hoje > s.inicio ? hoje : s.inicio,
    })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.template_id) { setFormError('Selecione o modelo de checklist.'); return }
    if (!form.title.trim()) { setFormError('O título é obrigatório.'); return }
    if (!form.inicio) { setFormError('Informe a data.'); return }
    const prazo = Math.max(1, Math.min(60, parseInt(form.prazo_dias) || 1))
    if (editSerie && !form.recorrencia) { setFormError('Para parar a repetição, use "Encerrar" na lista de recorrências.'); return }
    setSaving(true)
    try {
      if (!form.recorrencia) {
        await createChecklistAvulso({
          template_id: form.template_id, title: form.title, client_id: form.client_id || null, location_id: form.location_id || null,
          technician_ids: form.technician_ids, recurrence: null, data_prevista: form.inicio, prazo: somarDias(form.inicio, prazo - 1),
        })
      } else {
        const rec = form.recorrencia
        const { error } = await supabase.rpc('salvar_serie', {
          p_id: editSerie?.id ?? null, p_template: form.template_id, p_titulo: form.title,
          p_client: form.client_id || null, p_location: form.location_id || null, p_tecnicos: form.technician_ids,
          p_regra: rec.regra, p_resumo: resumoRecorrencia(rec), p_rrule: regraParaRRule(rec), p_inicio: form.inicio,
          p_termino_tipo: rec.termino_tipo, p_termino_qtd: rec.termino_qtd, p_termino_data: rec.termino_data,
          p_prazo_dias: prazo, p_a_partir: editSerie ? form.a_partir : null,
        })
        if (error) throw error
      }
      setModalOpen(false)
      recarregar()
      if (!editSerie) setAba(form.recorrencia ? 'recorrencias' : 'checklists')
    } catch (err: any) {
      setFormError(err?.message ?? 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function mudarSituacao(s: ChecklistSerie, situacaoNova: 'ativa' | 'pausada' | 'encerrada') {
    if (situacaoNova === 'encerrada' && !confirm(`Encerrar a recorrência "${s.titulo}"? Os checklists já feitos continuam guardados; os futuros ainda não iniciados são removidos.`)) return
    setErroAcao('')
    const { error } = await supabase.rpc('definir_situacao_serie', { p_id: s.id, p_situacao: situacaoNova })
    if (error) setErroAcao(error.message)
    recarregar()
  }

  // ---- "só esta" ----
  const [ocorrencia, setOcorrencia] = useState<ChecklistAvulso | null>(null)
  const [ocData, setOcData] = useState('')
  const [ocPrazo, setOcPrazo] = useState('')
  const [ocTecnicos, setOcTecnicos] = useState<string[]>([])
  const [ocErro, setOcErro] = useState('')
  const [ocSalvando, setOcSalvando] = useState(false)
  function abrirOcorrencia(c: ChecklistAvulso) {
    setOcorrencia(c)
    setOcData(c.data_prevista ?? hoje)
    setOcPrazo(c.prazo ?? c.data_prevista ?? hoje)
    setOcTecnicos((c.targets ?? []).map(t => t.technician.id))
    setOcErro('')
  }
  async function salvarOcorrencia() {
    if (!ocorrencia) return
    if (!ocData) { setOcErro('Informe a data.'); return }
    if (ocPrazo && ocPrazo < ocData) { setOcErro('O prazo precisa ser na data ou depois.'); return }
    setOcSalvando(true)
    const { error } = await supabase.rpc('alterar_ocorrencia', { p_id: ocorrencia.id, p_data: ocData, p_prazo: ocPrazo || ocData, p_tecnicos: ocTecnicos })
    setOcSalvando(false)
    if (error) { setOcErro(error.message); return }
    setOcorrencia(null)
    recarregar()
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteChecklistAvulso(toDelete.id)
      setToDelete(null)
      recarregar()
    } catch {
      alert('Não foi possível excluir o checklist.')
    } finally {
      setDeleting(false)
    }
  }

  function Selo({ c }: { c: ChecklistAvulso }) {
    const sit = situacao(c)
    return (
      <span className={'inline-block px-2 py-0.5 rounded-md text-xs font-medium border whitespace-nowrap ' + STATUS_STYLES[sit === 'atrasado' ? 'atrasado' : c.status]}>
        {sit === 'atrasado' ? 'Atrasado' : STATUS_LABELS[c.status]}
      </span>
    )
  }
  function Data({ c }: { c: ChecklistAvulso }) {
    if (!c.data_prevista) return <span className="text-xs text-muted-foreground">Sem data</span>
    return (
      <span className={cn('text-xs whitespace-nowrap', situacao(c) === 'atrasado' ? 'text-red-400' : 'text-muted-foreground')}>
        {dataCurtaDia(c.data_prevista)}{c.prazo && c.prazo !== c.data_prevista ? ` · prazo ${dataCurtaDia(c.prazo)}` : ''}
      </span>
    )
  }
  const tecnicosDe = (c: ChecklistAvulso) => c.targets && c.targets.length > 0 ? c.targets.map(t => t.technician.name).join(', ') : 'Sem técnico'
  const colunas: Column<ChecklistAvulso>[] = [
    { key: 'titulo', header: 'Checklist', render: c => (
      <div className="min-w-0" data-ocorrencia={c.title_snapshot + (c.data_prevista ? ' ' + c.data_prevista : '')}>
        <p className="font-medium text-foreground truncate">{c.title_snapshot}</p>
        {c.recurrence && <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Repeat size={10} /> {c.recurrence}</p>}
      </div>
    ) },
    { key: 'data', header: 'Data', render: c => <Data c={c} /> },
    { key: 'situacao', header: 'Situação', render: c => <Selo c={c} /> },
    { key: 'onde', header: 'Cliente / Unidade', render: c => (
      <span className="text-xs text-muted-foreground">{c.client?.name ?? 'Geral'}{c.location?.name ? ' · ' + c.location.name : ''}</span>
    ) },
    { key: 'tecnicos', header: 'Técnicos', render: c => <span className="text-xs text-muted-foreground">{tecnicosDe(c)}</span> },
  ]
  function acoes(c: ChecklistAvulso) {
    return (<>
      {c.status !== 'concluido' && (
        <button onClick={() => abrirOcorrencia(c)} title="Remarcar só este" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition"><CalendarClock size={15} /></button>
      )}
      <button onClick={() => setToDelete({ id: c.id, title: c.title_snapshot })} title="Excluir" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-secondary transition"><Trash2 size={15} /></button>
    </>)
  }
  function cartao(c: ChecklistAvulso) {
    return (
      <Card className="p-4" data-ocorrencia={c.title_snapshot + (c.data_prevista ? ' ' + c.data_prevista : '')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><Selo c={c} />{c.recurrence && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground inline-flex items-center gap-1"><Repeat size={10} /> {c.recurrence}</span>}</div>
            <p className="font-medium text-foreground mt-1">{c.title_snapshot}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">{acoes(c)}</div>
        </div>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5"><CalendarDays size={11} /> <Data c={c} /></p>
          <p className="flex items-center gap-1.5">{c.client?.name ? <><Building2 size={11} /> {c.client.name}</> : 'Geral'}{c.location?.name && <><MapPin size={11} className="ml-1" /> {c.location.name}</>}</p>
          <p className="flex items-center gap-1.5"><Users size={11} /> {tecnicosDe(c)}</p>
        </div>
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title="Checklists avulsos"
        description="Vistorias e inspeções independentes de uma Ordem de Serviço — únicas ou recorrentes"
        actions={<Button onClick={openNew} variant="cta"><Plus size={16} /> Novo checklist</Button>}
      />

      <div className="flex gap-1 border-b border-border mb-4" role="tablist">
        {([['checklists', 'Checklists'], ['recorrencias', `Recorrências (${series.filter(s => s.situacao !== 'encerrada').length})`]] as const).map(([k, r]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={cn('px-3 py-2 text-sm -mb-px border-b-2 transition', aba === k ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {r}
          </button>
        ))}
      </div>
      {erroAcao && <p className="text-sm text-red-400 mb-3">{erroAcao}</p>}

      {aba === 'checklists' ? (<>
        <FiltrosLista campos={camposFiltro}
          valores={{ cli: f.cli, uni: f.uni, tec: f.tec, mod: f.mod, serie: f.serie }}
          onChange={(k, v) => definir(k === 'cli' ? { cli: v, uni: '' } : { [k]: v })}
          periodo={{ valor: f.per as ChavePeriodo, de: f.de, ate: f.ate, onChange: (per, de, ate) => definir({ per, de: per === 'personalizado' ? (de ?? '') : '', ate: per === 'personalizado' ? (ate ?? '') : '' }) }}
          onLimpar={() => limpar(['aba'])} />
        {error ? (
          <Card className="p-6 text-center text-red-400 text-sm">{error}</Card>
        ) : (
          <DataListView<ChecklistAvulso>
            items={itens}
            loading={loading}
            viewKey="checklists-avulsos"
            search={busca}
            onSearchChange={setBusca}
            searchPlaceholder="Buscar pelo título..."
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
            rowActions={acoes}
            getKey={c => c.id}
            emptyState={
              <Card>
                <EmptyState icon={ClipboardCheck} title="Nenhum checklist encontrado"
                  description={f.sit === 'aberto' ? 'Nada em aberto até os próximos 7 dias com estes filtros.' : 'Nenhum checklist com estes filtros.'}
                  action={<Button onClick={openNew} variant="cta"><Plus size={16} /> Novo checklist</Button>} />
              </Card>
            }
          />
        )}
      </>) : (
        series.length === 0 ? (
          <Card>
            <EmptyState icon={Repeat} title="Nenhuma recorrência"
              description='Crie um checklist e escolha como ele se repete no campo "Repetir" (ex.: toda segunda, todo mês no dia 10).'
              action={<Button onClick={openNew} variant="cta"><Plus size={16} /> Novo checklist</Button>} />
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {series.map(s => {
              const [rot, est] = SITUACAO_SERIE[s.situacao]
              const prox = s.proxima
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3" data-serie={s.titulo}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{s.titulo}</span>
                      <span className={'inline-block px-2 py-0.5 rounded-md text-xs font-medium border ' + est}>{rot}</span>
                    </div>
                    <p className="text-xs text-foreground/90 mt-0.5 flex items-center gap-1.5"><Repeat size={11} className="text-primary" /> {s.resumo} · desde {dataBR(s.inicio)} · concluir {textoPrazo(s.prazo_dias)}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                      {s.situacao === 'ativa' && <span className="flex items-center gap-1"><CalendarDays size={11} /> Próxima: {prox ? dataCurtaDia(prox) : 'fora da janela de 7 dias'}</span>}
                      {s.client?.name ? <span className="flex items-center gap-1"><Building2 size={11} /> {s.client.name}</span> : <span>Geral</span>}
                      {s.location?.name && <span className="flex items-center gap-1"><MapPin size={11} /> {s.location.name}</span>}
                      <span className="flex items-center gap-1"><Users size={11} /> {s.tecnicos?.length ? s.tecnicos.map(nomeTecnico).join(', ') : 'Sem técnico'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => definir({ aba: 'checklists', serie: s.id, sit: 'todos' })} title="Ver checklists desta recorrência" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"><ListFilter size={15} /></button>
                    <button onClick={() => openEditSerie(s)} title="Editar (esta e as seguintes)" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"><Pencil size={15} /></button>
                    {s.situacao === 'ativa' && <button onClick={() => mudarSituacao(s, 'pausada')} title="Pausar" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-amber-400 hover:bg-secondary"><Pause size={15} /></button>}
                    {s.situacao === 'pausada' && <button onClick={() => mudarSituacao(s, 'ativa')} title="Retomar" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-green-400 hover:bg-secondary"><Play size={15} /></button>}
                    {s.situacao !== 'encerrada' && <button onClick={() => mudarSituacao(s, 'encerrada')} title="Encerrar" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-secondary"><Square size={14} /></button>}
                  </div>
                </div>
              )
            })}
          </Card>
        )
      )}

      <Modal open={modalOpen} onOpenChange={o => { if (!o) setModalOpen(false) }} className="max-w-lg" fecharAoClicarFora={false}
        title={editSerie ? 'Editar recorrência' : 'Novo checklist avulso'}
        description={editSerie ? 'As alterações valem a partir da data escolhida; o que já passou fica como está' : 'Vistoria ou inspeção sem vínculo com uma OS — única ou recorrente'}>
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
              <Combobox id="client" options={clientOptions} value={form.client_id} onChange={v => setForm({ ...form, client_id: v, location_id: '' })} placeholder="Geral (sem cliente)" searchPlaceholder="Buscar cliente..." emptyText="Nenhum cliente encontrado." />
            </div>
            <div>
              <Label htmlFor="location">Unidade</Label>
              <Combobox id="location" options={locationOptions} value={form.location_id} onChange={v => setForm({ ...form, location_id: v })} placeholder={form.client_id ? 'Selecione a unidade' : 'Escolha o cliente primeiro'} searchPlaceholder="Buscar unidade..." emptyText="Nenhuma unidade para este cliente." />
            </div>
          </div>
          <div>
            <Label htmlFor="technicians">Técnicos responsáveis</Label>
            <MultiCombobox id="technicians" options={technicianOptions} value={form.technician_ids} onChange={v => setForm({ ...form, technician_ids: v })} placeholder="Nenhum técnico selecionado" searchPlaceholder="Buscar técnico..." emptyText="Nenhum técnico encontrado." />
            {form.technician_ids.length === 0 && <p className="text-xs text-muted-foreground mt-1">Sem técnico atribuído, o checklist só aparece aqui no painel.</p>}
          </div>

          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inicio">{form.recorrencia ? 'Começa em *' : 'Data *'}</Label>
                <Input id="inicio" type="date" value={form.inicio} onChange={e => setForm({ ...form, inicio: e.target.value })} disabled={!!editSerie} />
              </div>
              <div>
                <Label htmlFor="prazo">Prazo para concluir</Label>
                <select id="prazo" value={form.prazo_dias} onChange={e => setForm({ ...form, prazo_dias: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground">
                  {[1, 2, 3, 5, 7, 10, 15, 30].map(n => <option key={n} value={n}>{textoPrazo(n)}</option>)}
                </select>
              </div>
            </div>
            {!form.recorrencia && <AvisoData data={form.inicio} locationId={form.location_id || null} testId="aviso-data-unica" />}
            <RecorrenciaCampo key={editSerie?.id ?? 'novo'} inicio={form.inicio} valor={form.recorrencia} locationId={form.location_id || null}
              onChange={v => setForm(f => ({ ...f, recorrencia: v }))} />
            {editSerie && (
              <div>
                <Label htmlFor="a-partir">As alterações valem a partir de</Label>
                <Input id="a-partir" type="date" value={form.a_partir} min={hoje} onChange={e => setForm({ ...form, a_partir: e.target.value })} />
                <p className="text-[11px] text-muted-foreground mt-1">Checklists desta recorrência a partir dessa data que ainda não foram iniciados são refeitos com a nova regra. Os já iniciados ou concluídos não mudam.</p>
              </div>
            )}
          </div>

          {formError && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{formError}</div>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="cta" loading={saving}>{editSerie ? 'Salvar' : form.recorrencia ? 'Criar recorrência' : 'Criar checklist'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!ocorrencia} onOpenChange={o => { if (!o) setOcorrencia(null) }} title="Remarcar só este checklist"
        description={ocorrencia ? `${ocorrencia.title_snapshot}${ocorrencia.serie_id ? ' — a recorrência não muda' : ''}` : ''}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="oc-data">Data</Label>
              <Input id="oc-data" type="date" value={ocData} onChange={e => { setOcData(e.target.value); if (ocPrazo < e.target.value) setOcPrazo(e.target.value) }} />
            </div>
            <div>
              <Label htmlFor="oc-prazo">Prazo</Label>
              <Input id="oc-prazo" type="date" value={ocPrazo} min={ocData} onChange={e => setOcPrazo(e.target.value)} />
            </div>
          </div>
          <AvisoData data={ocData} locationId={ocorrencia?.location_id} testId="aviso-remarcar" />
          <div>
            <Label htmlFor="oc-tecnicos">Técnicos</Label>
            <MultiCombobox id="oc-tecnicos" options={technicianOptions} value={ocTecnicos} onChange={setOcTecnicos} placeholder="Nenhum técnico" searchPlaceholder="Buscar técnico..." emptyText="Nenhum técnico." />
          </div>
          {ocErro && <p className="text-sm text-red-400">{ocErro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOcorrencia(null)}>Cancelar</Button>
            <Button variant="cta" loading={ocSalvando} onClick={salvarOcorrencia}>Salvar</Button>
          </div>
        </div>
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
