import { useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useChecklistAvulsos, useChecklistSeries, type ChecklistAvulso, type ChecklistSerie } from '@/hooks/useChecklistAvulsos'
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
import { ClipboardCheck, Plus, Trash2, Building2, MapPin, Users, Repeat, CalendarDays, Pencil, Pause, Play, Square, CalendarClock } from 'lucide-react'

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

const chipsOcorrencias = [
  { key: 'all', label: 'Todos' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'atrasado', label: 'Atrasados' },
  { key: 'concluido', label: 'Concluídos' },
]

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
  const { checklists, loading, error, createChecklistAvulso, deleteChecklistAvulso, fetchChecklists } = useChecklistAvulsos()
  const { series, fetchSeries } = useChecklistSeries()
  const { templates } = useChecklistTemplates()
  const { clients } = useClients()
  const { technicians } = useTechnicians()

  const vazio = (): Form => ({ template_id: '', title: '', client_id: '', location_id: '', technician_ids: [], inicio: hoje, prazo_dias: '1', recorrencia: null, a_partir: hoje })
  const [aba, setAba] = useState<'checklists' | 'recorrencias'>('checklists')
  const [modalOpen, setModalOpen] = useState(false)
  const [editSerie, setEditSerie] = useState<ChecklistSerie | null>(null)
  const [form, setForm] = useState<Form>(vazio)
  const { locations: formLocations } = useLocations(form.client_id || undefined)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [chip, setChip] = useState('all')
  const [toDelete, setToDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [erroAcao, setErroAcao] = useState('')

  const clientOptions = useMemo(() => clients.map(c => ({ value: c.id, label: c.name })), [clients])
  const locationOptions = useMemo(() => (form.client_id ? formLocations.map(l => ({ value: l.id, label: l.name })) : []), [formLocations, form.client_id])
  const templateOptions = useMemo(() => templates.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name })), [templates])
  const technicianOptions = useMemo(() => technicians.filter(t => t.active).map(t => ({ value: t.id, label: t.name })), [technicians])
  const nomeTecnico = (id: string) => technicians.find(t => t.id === id)?.name ?? '—'

  const situacao = (c: ChecklistAvulso) => situacaoOcorrencia(c, hoje)
  const visible = useMemo(() => {
    if (chip === 'all') return checklists
    if (chip === 'atrasado') return checklists.filter(c => situacao(c) === 'atrasado')
    if (chip === 'pendente') return checklists.filter(c => c.status === 'pendente' && situacao(c) !== 'atrasado')
    return checklists.filter(c => c.status === chip)
  }, [checklists, chip, hoje]) // eslint-disable-line react-hooks/exhaustive-deps

  const proximaDa = (serieId: string) => checklists
    .filter(c => c.serie_id === serieId && c.status !== 'concluido' && (c.data_prevista ?? '') >= hoje)
    .map(c => c.data_prevista!).sort()[0]

  function recarregar() { fetchChecklists(); fetchSeries() }

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
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {chipsOcorrencias.map(c => (
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
            <EmptyState icon={ClipboardCheck} title="Nenhum checklist avulso"
              description="Crie o primeiro checklist independente de uma OS — vistoria, inspeção ou levantamento, único ou recorrente."
              action={<Button onClick={openNew} variant="cta"><Plus size={16} /> Novo checklist</Button>} />
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {visible.map(c => {
              const sit = situacao(c)
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3" data-ocorrencia={c.title_snapshot + (c.data_prevista ? ' ' + c.data_prevista : '')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{c.title_snapshot}</span>
                      <span className={'inline-block px-2 py-0.5 rounded-md text-xs font-medium border ' + STATUS_STYLES[sit === 'atrasado' ? 'atrasado' : c.status]}>
                        {sit === 'atrasado' ? 'Atrasado' : STATUS_LABELS[c.status]}
                      </span>
                      {c.recurrence && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground inline-flex items-center gap-1"><Repeat size={10} /> {c.recurrence}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                      {c.data_prevista && (
                        <span className={cn('flex items-center gap-1', sit === 'atrasado' && 'text-red-400')}>
                          <CalendarDays size={11} /> {dataCurtaDia(c.data_prevista)}{c.prazo && c.prazo !== c.data_prevista ? ` · prazo ${dataCurtaDia(c.prazo)}` : ''}
                        </span>
                      )}
                      {c.client?.name ? <span className="flex items-center gap-1"><Building2 size={11} /> {c.client.name}</span> : <span>Geral</span>}
                      {c.location?.name && <span className="flex items-center gap-1"><MapPin size={11} /> {c.location.name}</span>}
                      <span className="flex items-center gap-1">
                        <Users size={11} /> {c.targets && c.targets.length > 0 ? c.targets.map(t => t.technician.name).join(', ') : 'Sem técnico'}
                      </span>
                    </div>
                  </div>
                  {c.status !== 'concluido' && (
                    <button onClick={() => abrirOcorrencia(c)} title="Remarcar só este" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition flex-shrink-0"><CalendarClock size={15} /></button>
                  )}
                  <button onClick={() => setToDelete({ id: c.id, title: c.title_snapshot })} title="Excluir" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-secondary transition flex-shrink-0"><Trash2 size={15} /></button>
                </div>
              )
            })}
          </Card>
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
              const prox = proximaDa(s.id)
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
