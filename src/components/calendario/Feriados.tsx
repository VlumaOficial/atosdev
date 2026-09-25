import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import CidadeSelect from '@/components/calendario/CidadeSelect'
import { Combobox } from '@/components/ui/combobox'
import {
  ROTULO_TIPO, ROTULO_EFEITO, efeitoPadrao, textoJanela, rotuloAbrangencia, dataCurta, ufDoIbge, hhmm, UFS,
  type Feriado, type Efeito, type TipoFeriado, type Abrangencia,
} from '@/lib/calendario'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Loader2, MapPin, CalendarPlus } from 'lucide-react'

// Feriados em camadas (decisão 2026-09-25): nacionais mantidos pela
// plataforma (Super Admin); estaduais/municipais valem pela cidade da
// UNIDADE (código IBGE) — ou da sede quando não há unidade; da empresa
// valem sempre. A empresa decide o efeito de cada um (ponto facultativo:
// trabalha ou não).

const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 12 }, (_, i) => 2025 + i)

type Filtro = 'todos' | Abrangencia
const FILTROS: { k: Filtro; r: string }[] = [
  { k: 'todos', r: 'Todos' }, { k: 'nacional', r: 'Nacionais' }, { k: 'estadual', r: 'Estaduais' },
  { k: 'municipal', r: 'Municipais' }, { k: 'empresa', r: 'Da empresa' },
]

interface Form {
  nome: string; data: string; anual: boolean; abrangencia: Abrangencia
  uf: string; cidade_ibge: string; cidade: string
  tipo: TipoFeriado; janela_inicio: string; janela_fim: string
}
const FORM_VAZIO: Form = {
  nome: '', data: '', anual: true, abrangencia: 'empresa', uf: '', cidade_ibge: '', cidade: '',
  tipo: 'feriado', janela_inicio: '', janela_fim: '',
}

// data exibida no ano escolhido (feriado "todo ano" cadastrado em outro ano)
function dataNoAno(f: Feriado, ano: number): string {
  return f.anual ? `${ano}${f.data.slice(4)}` : f.data
}

export default function Feriados() {
  const { user, tenant, refreshTenant } = useAuth()
  const plataforma = user?.role === 'super_admin'
  const podeEditar = plataforma || user?.role === 'admin' || user?.role === 'gestor'

  const [ano, setAno] = useState(ANO_ATUAL)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [lista, setLista] = useState<Feriado[]>([])
  const [efeitos, setEfeitos] = useState<Record<string, Efeito>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await supabase.from('feriados')
      .select('id, tenant_id, data, anual, nome, abrangencia, uf, cidade_ibge, cidade, tipo, janela_inicio, janela_fim')
      .or(`and(data.gte.${ano}-01-01,data.lte.${ano}-12-31),and(anual.eq.true,data.lte.${ano}-12-31)`)
    if (error) { setErro('Não foi possível carregar os feriados.'); setCarregando(false); return }
    setErro('')
    const doAno = ((data ?? []) as Feriado[])
      .filter(f => !plataforma || f.tenant_id === null)
      .sort((a, b) => dataNoAno(a, ano).localeCompare(dataNoAno(b, ano)) || a.nome.localeCompare(b.nome))
    setLista(doAno)
    if (!plataforma) {
      const { data: ef } = await supabase.from('feriados_efeito_empresa').select('feriado_id, efeito')
      setEfeitos(Object.fromEntries((ef ?? []).map((e: any) => [e.feriado_id, e.efeito])))
    }
    setCarregando(false)
  }, [ano, plataforma])
  useEffect(() => { recarregar() }, [recarregar])

  const visiveis = useMemo(() => filtro === 'todos' ? lista : lista.filter(f => f.abrangencia === filtro), [lista, filtro])
  const temNacionais = lista.some(f => f.abrangencia === 'nacional')

  // ---- efeito escolhido pela empresa ----
  const [erroEfeito, setErroEfeito] = useState('')
  async function mudarEfeito(f: Feriado, ef: Efeito) {
    setErroEfeito('')
    const valor = ef === efeitoPadrao(f.tipo) ? null : ef
    const { error } = await supabase.rpc('definir_efeito_feriado', { p_feriado: f.id, p_efeito: valor })
    if (error) { setErroEfeito(error.message); return }
    setEfeitos(e => { const n = { ...e }; if (valor) n[f.id] = valor; else delete n[f.id]; return n })
  }

  // ---- sede ----
  const [editSede, setEditSede] = useState(false)
  const [sede, setSede] = useState({ uf: '', ibge: '', nome: '' })
  const [salvandoSede, setSalvandoSede] = useState(false)
  const [erroSede, setErroSede] = useState('')
  function abrirSede() {
    setSede({ uf: ufDoIbge(tenant?.sede_cidade_ibge) ?? '', ibge: tenant?.sede_cidade_ibge ?? '', nome: tenant?.sede_cidade ?? '' })
    setErroSede('')
    setEditSede(true)
  }
  async function salvarSede() {
    if (!sede.ibge) { setErroSede('Escolha a cidade.'); return }
    setSalvandoSede(true)
    const { error } = await supabase.rpc('definir_sede_empresa', { p_cidade_ibge: sede.ibge, p_cidade: sede.nome })
    setSalvandoSede(false)
    if (error) { setErroSede(error.message); return }
    await refreshTenant()
    setEditSede(false)
  }

  // ---- criar / editar ----
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Feriado | null>(null)
  const [form, setForm] = useState<Form>(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  function novo() {
    setEditando(null)
    setForm({ ...FORM_VAZIO, abrangencia: plataforma ? 'nacional' : 'empresa', anual: !plataforma })
    setErroForm('')
    setAberto(true)
  }
  function editar(f: Feriado) {
    setEditando(f)
    setForm({
      nome: f.nome, data: f.data, anual: f.anual, abrangencia: f.abrangencia, uf: f.uf ?? '',
      cidade_ibge: f.cidade_ibge ?? '', cidade: f.cidade ?? '', tipo: f.tipo,
      janela_inicio: hhmm(f.janela_inicio), janela_fim: hhmm(f.janela_fim),
    })
    setErroForm('')
    setAberto(true)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErroForm('')
    if (form.nome.trim().length < 2) { setErroForm('Informe o nome do feriado.'); return }
    if (!form.data) { setErroForm('Informe a data.'); return }
    if (form.abrangencia === 'estadual' && !form.uf) { setErroForm('Escolha o estado.'); return }
    if (form.abrangencia === 'municipal' && !form.cidade_ibge) { setErroForm('Escolha a cidade.'); return }
    const comJanela = form.tipo === 'reduzido'
    const hora = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/
    if (comJanela && (!hora.test(form.janela_inicio) || !hora.test(form.janela_fim))) {
      setErroForm('Informe o horário do expediente reduzido (HH:MM).'); return
    }
    if (comJanela && form.janela_fim <= form.janela_inicio) { setErroForm('O fim precisa ser depois do início.'); return }
    const dados = {
      nome: form.nome.trim(), data: form.data, anual: form.anual, abrangencia: form.abrangencia,
      uf: form.abrangencia === 'estadual' || form.abrangencia === 'municipal' ? form.uf : null,
      cidade_ibge: form.abrangencia === 'municipal' ? form.cidade_ibge : null,
      cidade: form.abrangencia === 'municipal' ? form.cidade : null,
      tipo: form.tipo,
      janela_inicio: comJanela ? form.janela_inicio : null,
      janela_fim: comJanela ? form.janela_fim : null,
    }
    setSalvando(true)
    const { error } = editando
      ? await supabase.from('feriados').update(dados).eq('id', editando.id)
      : await supabase.from('feriados').insert(dados)
    setSalvando(false)
    if (error) {
      setErroForm(error.code === '23505' ? 'Esse feriado já está cadastrado.' : 'Não foi possível salvar. ' + error.message)
      return
    }
    setAberto(false)
    recarregar()
  }

  async function excluir(f: Feriado) {
    if (!confirm(`Excluir "${f.nome}"?`)) return
    const { error } = await supabase.from('feriados').delete().eq('id', f.id)
    if (error) alert('Não foi possível excluir: ' + error.message)
    recarregar()
  }

  const [gerando, setGerando] = useState(false)
  async function gerarNacionais() {
    setGerando(true)
    const { error } = await supabase.rpc('gerar_feriados_nacionais', { p_ano: ano })
    setGerando(false)
    if (error) alert(error.message)
    recarregar()
  }

  const podeMexer = (f: Feriado) => podeEditar && (plataforma ? f.tenant_id === null : f.tenant_id !== null)

  return (
    <div className="space-y-3">
      {!plataforma && (
        <Card className="p-4">
          {!editSede ? (
            <div className="flex items-start gap-3">
              <MapPin size={16} className="text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  Sede da empresa: <b data-testid="sede-atual">{tenant?.sede_cidade ? `${tenant.sede_cidade} - ${ufDoIbge(tenant.sede_cidade_ibge)}` : 'não informada'}</b>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Feriados estaduais e municipais valem pela cidade da <b>Unidade</b> do cliente. Quando não há Unidade (ex.: checklist sem unidade), vale a cidade da sede.
                </p>
              </div>
              {podeEditar && <Button size="sm" variant="outline" onClick={abrirSede}>{tenant?.sede_cidade ? 'Alterar' : 'Informar'}</Button>}
            </div>
          ) : (
            <div className="space-y-3">
              <CidadeSelect idPrefixo="sede" uf={sede.uf} ibge={sede.ibge} onChange={setSede} rotuloCidade="Cidade da sede" />
              {erroSede && <p className="text-xs text-red-400">{erroSede}</p>}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditSede(false)}>Cancelar</Button>
                <Button size="sm" variant="cta" loading={salvandoSede} onClick={salvarSede}>Salvar sede</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Ano" value={ano} onChange={e => setAno(Number(e.target.value))}
          className="px-2 py-1.5 rounded-md bg-input border border-border text-sm text-foreground">
          {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="flex flex-wrap gap-1.5 flex-1">
          {FILTROS.filter(f => !plataforma || f.k !== 'empresa').map(f => (
            <button key={f.k} type="button" onClick={() => setFiltro(f.k)}
              className={cn('px-2.5 py-1 rounded-full text-xs border transition',
                filtro === f.k ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              {f.r}
            </button>
          ))}
        </div>
        {podeEditar && <Button variant="cta" size="sm" onClick={novo}><Plus size={14} /> {plataforma ? 'Novo feriado da plataforma' : 'Novo feriado'}</Button>}
      </div>

      {plataforma && !carregando && !temNacionais && (
        <Card className="p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Nenhum feriado nacional cadastrado para {ano}.</p>
          <Button size="sm" variant="outline" loading={gerando} onClick={gerarNacionais}><CalendarPlus size={14} /> Gerar nacionais de {ano}</Button>
        </Card>
      )}

      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {erroEfeito && <p className="text-sm text-red-400">{erroEfeito}</p>}

      {carregando ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>
      ) : (
        <Card className="divide-y divide-border">
          {visiveis.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum feriado neste filtro.</p>}
          {visiveis.map(f => {
            const efeito = efeitos[f.id] ?? efeitoPadrao(f.tipo)
            return (
              <div key={f.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-2.5" data-feriado={f.nome}>
                <span className="w-20 flex-shrink-0 text-xs font-mono text-muted-foreground">{dataCurta(dataNoAno(f, ano))}</span>
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm text-foreground">{f.nome}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {rotuloAbrangencia(f)} · {ROTULO_TIPO[f.tipo]}{f.janela_inicio ? ` (${textoJanela(f)})` : ''}{f.anual ? ' · todo ano' : ''}
                  </p>
                </div>
                {!plataforma && (
                  podeEditar ? (
                    <select aria-label={'Efeito ' + f.nome} value={efeito} onChange={e => mudarEfeito(f, e.target.value as Efeito)}
                      className={cn('px-2 py-1.5 rounded-md bg-input border text-xs',
                        efeito === 'folga' ? 'border-amber-500/40 text-amber-300' : efeito === 'reduzido' ? 'border-sky-500/40 text-sky-300' : 'border-border text-foreground')}>
                      <option value="folga">{ROTULO_EFEITO.folga}</option>
                      <option value="normal">{ROTULO_EFEITO.normal}</option>
                      {f.janela_inicio && <option value="reduzido">{ROTULO_EFEITO.reduzido} ({textoJanela(f)})</option>}
                    </select>
                  ) : <span className="text-xs text-muted-foreground">{ROTULO_EFEITO[efeito]}</span>
                )}
                <div className="flex items-center gap-1 w-14 justify-end flex-shrink-0">
                  {podeMexer(f) && (<>
                    <button title="Editar" onClick={() => editar(f)}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary">
                      <Pencil size={13} />
                    </button>
                    <button title="Excluir" onClick={() => excluir(f)}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                      <Trash2 size={13} />
                    </button>
                  </>)}
                </div>
              </div>
            )
          })}
        </Card>
      )}
      {!plataforma && (
        <p className="text-[11px] text-muted-foreground">
          Carnaval, Quarta-feira de Cinzas e Corpus Christi são <b>ponto facultativo</b> (não são feriados nacionais por lei): escolha se a empresa tem expediente.
          Feriados nacionais são mantidos pela plataforma ATOS.
        </p>
      )}

      <Modal open={aberto} onOpenChange={setAberto} className="max-w-lg"
        title={editando ? 'Editar feriado' : plataforma ? 'Novo feriado da plataforma' : 'Novo feriado'}
        description={plataforma ? 'Vale para todas as empresas do ATOS' : 'Feriado estadual, municipal, da empresa ou dia com expediente reduzido'}>
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <Label htmlFor="feriado-nome">Nome *</Label>
            <Input id="feriado-nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Independência da Bahia, Aniversário da cidade, Véspera de Natal" />
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <Label htmlFor="feriado-data">Data *</Label>
              <Input id="feriado-data" type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 pb-2.5 cursor-pointer">
              <input type="checkbox" checked={form.anual} onChange={e => setForm({ ...form, anual: e.target.checked })} />
              <span className="text-sm text-foreground">Repete todo ano</span>
            </label>
          </div>

          <div>
            <Label>Vale para</Label>
            <div className="flex flex-wrap gap-1.5">
              {((plataforma ? ['nacional', 'estadual', 'municipal'] : ['empresa', 'estadual', 'municipal']) as Abrangencia[]).map(a => (
                <button key={a} type="button" onClick={() => setForm({ ...form, abrangencia: a })}
                  className={cn('px-2.5 py-1.5 rounded-md text-xs border transition',
                    form.abrangencia === a ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {a === 'empresa' ? 'Toda a empresa' : a === 'nacional' ? 'Todo o Brasil' : a === 'estadual' ? 'Um estado' : 'Uma cidade'}
                </button>
              ))}
            </div>
          </div>
          {form.abrangencia === 'estadual' && (
            <div className="max-w-[140px]">
              <Label htmlFor="feriado-uf">Estado</Label>
              <Combobox id="feriado-uf" options={UFS.map(u => ({ value: u, label: u }))} value={form.uf}
                onChange={v => setForm({ ...form, uf: v })} placeholder="UF" searchPlaceholder="UF..." emptyText="UF inválida." />
            </div>
          )}
          {form.abrangencia === 'municipal' && (
            <CidadeSelect idPrefixo="feriado" uf={form.uf} ibge={form.cidade_ibge}
              onChange={v => setForm({ ...form, uf: v.uf, cidade_ibge: v.ibge, cidade: v.nome })} />
          )}

          <div>
            <Label>Tipo</Label>
            <div className="flex flex-wrap gap-1.5">
              {(['feriado', 'facultativo', 'reduzido'] as TipoFeriado[]).map(t => (
                <button key={t} type="button" onClick={() => setForm({ ...form, tipo: t })}
                  className={cn('px-2.5 py-1.5 rounded-md text-xs border transition',
                    form.tipo === t ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {ROTULO_TIPO[t]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {form.tipo === 'feriado' && 'Sem expediente no dia (a empresa pode mudar para expediente normal).'}
              {form.tipo === 'facultativo' && 'Expediente normal, a menos que a empresa escolha folgar.'}
              {form.tipo === 'reduzido' && 'Expediente só dentro do horário abaixo (ex.: véspera de Natal até 12:00).'}
            </p>
          </div>
          {form.tipo === 'reduzido' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="janela-ini">Expediente das</Label>
                <Input id="janela-ini" value={form.janela_inicio} placeholder="00:00" inputMode="numeric"
                  onChange={e => setForm({ ...form, janela_inicio: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="janela-fim">às</Label>
                <Input id="janela-fim" value={form.janela_fim} placeholder="12:00" inputMode="numeric"
                  onChange={e => setForm({ ...form, janela_fim: e.target.value })} />
              </div>
            </div>
          )}
          {erroForm && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{erroForm}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="submit" variant="cta" loading={salvando}>Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
