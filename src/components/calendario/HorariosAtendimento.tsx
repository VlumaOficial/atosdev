import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import SemanaEditor from '@/components/calendario/SemanaEditor'
import { resumoSemana, validarSemana, ordenarSemana, MODELOS_SEMANA, type Semana } from '@/lib/calendario'
import { Clock, Plus, Pencil, Trash2, Power, Star, Loader2 } from 'lucide-react'

// Horários de atendimento NOMEADOS (decisão 2026-09-25): quando a empresa
// atende o cliente — base do SLA e do "dia útil". Um é o padrão; depois,
// cliente/contrato poderá usar outro (ex.: 24x7). Não confundir com
// ESCALA (quando a pessoa trabalha) — etapa futura.

export interface HorarioAtendimento {
  id: string
  nome: string
  semana: Semana
  considera_feriados: boolean
  padrao: boolean
  ativo: boolean
}

interface Form { nome: string; semana: Semana; considera_feriados: boolean }

export function useHorariosAtendimento() {
  const [itens, setItens] = useState<HorarioAtendimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const recarregar = useCallback(async () => {
    const { data, error } = await supabase.from('horarios_atendimento')
      .select('id, nome, semana, considera_feriados, padrao, ativo')
      .order('padrao', { ascending: false }).order('nome')
    if (error) setErro('Não foi possível carregar os horários.')
    else { setErro(''); setItens((data ?? []) as HorarioAtendimento[]) }
    setCarregando(false)
  }, [])
  useEffect(() => { recarregar() }, [recarregar])
  return { itens, carregando, erro, recarregar }
}

export default function HorariosAtendimento({ podeEditar }: { podeEditar: boolean }) {
  const { itens, carregando, erro, recarregar } = useHorariosAtendimento()
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<HorarioAtendimento | null>(null)
  const [form, setForm] = useState<Form>({ nome: '', semana: {}, considera_feriados: true })
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')
  const [erroAcao, setErroAcao] = useState('')

  function novo() {
    setEditando(null)
    setForm({ nome: '', semana: JSON.parse(JSON.stringify(MODELOS_SEMANA[0].semana)), considera_feriados: true })
    setErroForm('')
    setAberto(true)
  }
  function editar(h: HorarioAtendimento) {
    setEditando(h)
    setForm({ nome: h.nome, semana: JSON.parse(JSON.stringify(h.semana ?? {})), considera_feriados: h.considera_feriados })
    setErroForm('')
    setAberto(true)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErroForm('')
    if (form.nome.trim().length < 2) { setErroForm('Dê um nome ao horário (ex.: Comercial, 24x7).'); return }
    const nomeNorm = form.nome.trim().toLowerCase()
    if (itens.some(h => h.id !== editando?.id && h.nome.trim().toLowerCase() === nomeNorm)) {
      setErroForm('Já existe um horário com esse nome.'); return
    }
    const problema = validarSemana(form.semana)
    if (problema) { setErroForm(problema); return }
    const semana = ordenarSemana(form.semana)
    if (!Object.keys(semana).length) { setErroForm('Marque pelo menos um dia com expediente.'); return }
    setSalvando(true)
    const dados = { nome: form.nome.trim(), semana, considera_feriados: form.considera_feriados }
    const { error } = editando
      ? await supabase.from('horarios_atendimento').update(dados).eq('id', editando.id)
      : await supabase.from('horarios_atendimento').insert(dados)
    setSalvando(false)
    if (error) {
      setErroForm(error.code === '23505' ? 'Já existe um horário com esse nome.' : 'Não foi possível salvar. ' + error.message)
      return
    }
    setAberto(false)
    recarregar()
  }

  async function acao(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setErroAcao('')
    const { error } = await fn()
    if (error) setErroAcao(error.message)
    recarregar()
  }

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-lg">
          Quando a empresa atende os clientes. O <b className="text-foreground">padrão</b> define o que é "dia útil" na
          recorrência dos checklists e será a base do SLA. Crie outros (ex.: 24x7) para clientes com contrato diferente.
        </p>
        {podeEditar && <Button variant="cta" size="sm" onClick={novo}><Plus size={14} /> Novo horário</Button>}
      </div>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {erroAcao && <p className="text-sm text-red-400" data-testid="horario-erro">{erroAcao}</p>}

      {itens.map(h => (
        <Card key={h.id} className={'p-4 ' + (h.ativo ? '' : 'opacity-60')} data-horario={h.nome}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Clock size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground">{h.nome}</p>
                {h.padrao && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">Padrão da empresa</span>}
                {!h.ativo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">Inativo</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{resumoSemana(h.semana)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {h.considera_feriados ? 'Respeita os feriados' : 'Ignora feriados (atende também nos feriados)'}
              </p>
            </div>
            {podeEditar && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {!h.padrao && h.ativo && (
                  <button title="Tornar padrão" onClick={() => acao(() => supabase.rpc('definir_horario_padrao', { p_id: h.id }))}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-secondary">
                    <Star size={14} />
                  </button>
                )}
                <button title="Editar" onClick={() => editar(h)}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary">
                  <Pencil size={14} />
                </button>
                {!h.padrao && (<>
                  <button title={h.ativo ? 'Desativar' : 'Ativar'}
                    onClick={() => acao(() => supabase.from('horarios_atendimento').update({ ativo: !h.ativo }).eq('id', h.id))}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-amber-400 hover:bg-secondary">
                    <Power size={14} />
                  </button>
                  <button title="Excluir"
                    onClick={() => { if (confirm(`Excluir o horário "${h.nome}"?`)) acao(() => supabase.from('horarios_atendimento').delete().eq('id', h.id)) }}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 size={14} />
                  </button>
                </>)}
              </div>
            )}
          </div>
        </Card>
      ))}

      <Modal open={aberto} onOpenChange={setAberto} className="max-w-xl" fecharAoClicarFora={false}
        title={editando ? 'Editar horário de atendimento' : 'Novo horário de atendimento'}
        description="Dias e horários em que a empresa atende os clientes">
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <Label htmlFor="horario-nome">Nome *</Label>
            <Input id="horario-nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Comercial, 24x7, Plantão" />
          </div>
          <SemanaEditor valor={form.semana} onChange={s => setForm({ ...form, semana: s })} />
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.considera_feriados} className="mt-0.5"
              onChange={e => setForm({ ...form, considera_feriados: e.target.checked })} />
            <span>
              <span className="text-sm text-foreground">Respeitar os feriados</span>
              <span className="block text-xs text-muted-foreground">Desmarque para atendimento que não para nos feriados (ex.: 24x7).</span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">Resumo: <span className="text-foreground">{resumoSemana(ordenarSemana(form.semana))}</span></p>
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
