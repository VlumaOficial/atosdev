import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { useCategorias, useMotivosPausa, usePoliticasSla, type Categoria, type PoliticaSla, type MotivoPausa } from '@/hooks/useCatalogoSla'
import { useHorariosAtendimento } from '@/components/calendario/HorariosAtendimento'
import { useClients } from '@/hooks/useClients'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Combobox } from '@/components/ui/combobox'
import {
  IMPACTOS, URGENCIAS, NIVEIS_SLA, NIVEIS_INCIDENTE, ROTULO_NIVEL, ESTILO_NIVEL, MATRIZ_PADRAO, TIPOS, minutosTexto, dataHora,
  type Matriz,
} from '@/lib/sla'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Power, Lock, Loader2, Sparkles, CornerDownRight } from 'lucide-react'

// "Catálogo e SLA" (migration 044, padrão ITSM — decisões 2026-09-25):
// a própria empresa monta o catálogo de serviços, a regra de prioridade
// (matriz Impacto × Urgência ou escolha direta), as metas de SLA por
// nível (com exceções por cliente/categoria) e os motivos de pausa.

type Aba = 'categorias' | 'prioridades' | 'sla' | 'pausas'
const ABAS: [Aba, string][] = [['categorias', 'Categorias'], ['prioridades', 'Prioridades'], ['sla', 'SLA'], ['pausas', 'Motivos de pausa']]

export default function CatalogoSlaPage() {
  const { user } = useAuth()
  const podeEditar = user?.role === 'admin' || user?.role === 'gestor'
  const { valores, definir } = useFiltrosUrl({ aba: 'categorias' })
  const aba = valores.aba as Aba
  return (
    <div className="max-w-4xl">
      <PageHeader title="Catálogo e SLA" description="Serviços que a empresa atende, prioridades, prazos de SLA e motivos de pausa" />
      <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto" role="tablist">
        {ABAS.map(([k, r]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => definir({ aba: k })}
            className={cn('px-3 py-2 text-sm -mb-px border-b-2 transition whitespace-nowrap', aba === k ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {r}
          </button>
        ))}
      </div>
      {aba === 'categorias' && <AbaCategorias podeEditar={podeEditar} />}
      {aba === 'prioridades' && <AbaPrioridades podeEditar={podeEditar} />}
      {aba === 'sla' && <AbaSla podeEditar={podeEditar} />}
      {aba === 'pausas' && <AbaPausas podeEditar={podeEditar} />}
    </div>
  )
}

const btnIcone = 'w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary'
const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground'

// ---------------- Categorias ----------------
function AbaCategorias({ podeEditar }: { podeEditar: boolean }) {
  const { categorias, carregando, recarregar } = useCategorias()
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [form, setForm] = useState({ nome: '', pai_id: '', impacto: '', urgencia: '' })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const pais = categorias.filter(c => !c.pai_id)

  function abrir(c: Categoria | null, pai?: string) {
    setEditando(c)
    setForm(c ? { nome: c.nome, pai_id: c.pai_id ?? '', impacto: c.impacto ?? '', urgencia: c.urgencia ?? '' } : { nome: '', pai_id: pai ?? '', impacto: '', urgencia: '' })
    setErro(''); setAberto(true)
  }
  async function salvar() {
    if (form.nome.trim().length < 2) { setErro('Informe o nome.'); return }
    setSalvando(true)
    const dados = { nome: form.nome.trim(), pai_id: form.pai_id || null, impacto: form.impacto || null, urgencia: form.urgencia || null }
    const { error } = editando ? await supabase.from('os_categorias').update(dados).eq('id', editando.id) : await supabase.from('os_categorias').insert(dados)
    setSalvando(false)
    if (error) { setErro(error.code === '23505' ? 'Já existe uma categoria com esse nome aqui.' : error.message); return }
    setAberto(false); recarregar()
  }
  async function alternar(c: Categoria) { await supabase.from('os_categorias').update({ ativo: !c.ativo }).eq('id', c.id); recarregar() }
  async function excluir(c: Categoria) {
    if (!confirm(`Excluir "${c.nome}"${c.pai_id ? '' : ' e suas subcategorias'}? As OS que usam ficam sem categoria.`)) return
    await supabase.from('os_categorias').delete().eq('id', c.id); recarregar()
  }
  const sugestao = (c: Categoria) => c.impacto && c.urgencia
    ? `Sugere impacto ${IMPACTOS.find(i => i.value === c.impacto)?.label.toLowerCase()} · urgência ${URGENCIAS.find(u => u.value === c.urgencia)?.label.toLowerCase()}` : ''

  if (carregando) return <Loader2 className="animate-spin text-muted-foreground" size={18} />
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-xl">O catálogo de serviços da sua empresa: categorias e subcategorias usadas para classificar as OS (ex.: "CFTV › Câmera sem imagem"). Cada categoria pode sugerir o impacto e a urgência de um Incidente.</p>
        {podeEditar && <Button variant="cta" size="sm" onClick={() => abrir(null)}><Plus size={14} /> Nova categoria</Button>}
      </div>
      {pais.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma categoria ainda. Crie as categorias dos serviços que a sua empresa atende.</Card>
      ) : (
        <Card className="divide-y divide-border">
          {pais.map(p => (
            <div key={p.id}>
              <Linha c={p} sub={sugestao(p)} podeEditar={podeEditar} onEditar={() => abrir(p)} onAlternar={() => alternar(p)} onExcluir={() => excluir(p)}
                extra={podeEditar ? <button title="Nova subcategoria" onClick={() => abrir(null, p.id)} className={btnIcone}><Plus size={14} /></button> : null} />
              {categorias.filter(f => f.pai_id === p.id).map(f => (
                <Linha key={f.id} c={f} sub={sugestao(f)} filha podeEditar={podeEditar} onEditar={() => abrir(f)} onAlternar={() => alternar(f)} onExcluir={() => excluir(f)} />
              ))}
            </div>
          ))}
        </Card>
      )}
      <Modal open={aberto} onOpenChange={setAberto} title={editando ? 'Editar categoria' : form.pai_id ? 'Nova subcategoria' : 'Nova categoria'}>
        <div className="space-y-4">
          <div><Label htmlFor="cat-nome">Nome *</Label><Input id="cat-nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: CFTV, Rede, Câmera sem imagem" /></div>
          <div>
            <Label htmlFor="cat-pai">Dentro de (opcional)</Label>
            <Combobox id="cat-pai" value={form.pai_id} onChange={v => setForm({ ...form, pai_id: v })}
              options={[{ value: '', label: '— É uma categoria principal —' }, ...pais.filter(p => p.id !== editando?.id).map(p => ({ value: p.id, label: p.nome }))]}
              placeholder="É uma categoria principal" searchPlaceholder="Buscar..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="cat-imp">Impacto sugerido</Label>
              <select id="cat-imp" value={form.impacto} onChange={e => setForm({ ...form, impacto: e.target.value })} className={campo}>
                <option value="">Sem sugestão</option>{IMPACTOS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select></div>
            <div><Label htmlFor="cat-urg">Urgência sugerida</Label>
              <select id="cat-urg" value={form.urgencia} onChange={e => setForm({ ...form, urgencia: e.target.value })} className={campo}>
                <option value="">Sem sugestão</option>{URGENCIAS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select></div>
          </div>
          <p className="text-[11px] text-muted-foreground">A sugestão só preenche o formulário de um Incidente — quem abre a OS pode mudar.</p>
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button><Button variant="cta" loading={salvando} onClick={salvar}>Salvar</Button></div>
        </div>
      </Modal>
    </div>
  )
}

function Linha({ c, sub, filha, podeEditar, onEditar, onAlternar, onExcluir, extra }: {
  c: Categoria; sub: string; filha?: boolean; podeEditar: boolean; onEditar: () => void; onAlternar: () => void; onExcluir: () => void; extra?: React.ReactNode
}) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-2.5', filha && 'pl-10', !c.ativo && 'opacity-50')} data-categoria={c.nome}>
      {filha && <CornerDownRight size={13} className="text-muted-foreground -ml-5" />}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm text-foreground', !filha && 'font-medium')}>{c.nome}{!c.ativo && <span className="text-[10px] ml-2 text-muted-foreground">inativa</span>}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      {podeEditar && (<div className="flex items-center gap-1">
        {extra}
        <button title="Editar" onClick={onEditar} className={btnIcone}><Pencil size={13} /></button>
        <button title={c.ativo ? 'Desativar' : 'Ativar'} onClick={onAlternar} className={btnIcone}><Power size={13} /></button>
        <button title="Excluir" onClick={onExcluir} className={btnIcone + ' hover:text-red-400'}><Trash2 size={13} /></button>
      </div>)}
    </div>
  )
}

// ---------------- Prioridades ----------------
function AbaPrioridades({ podeEditar }: { podeEditar: boolean }) {
  const { tenant, refreshTenant } = useAuth()
  const [modo, setModo] = useState<'matriz' | 'simples'>(tenant?.prioridade_modo ?? 'matriz')
  const [matriz, setMatriz] = useState<Matriz>((tenant?.prioridade_matriz as Matriz) ?? MATRIZ_PADRAO)
  const [risco, setRisco] = useState(String(tenant?.sla_risco_pct ?? 75))
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true); setMsg(null)
    const { error } = await supabase.rpc('salvar_config_prioridade', { p_modo: modo, p_matriz: matriz, p_risco: parseInt(risco) || 75 })
    setSalvando(false)
    if (error) { setMsg({ ok: false, t: error.message }); return }
    await refreshTenant(); setMsg({ ok: true, t: 'Configuração salva.' })
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Como definir a prioridade de um Incidente</p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name="modo" checked={modo === 'matriz'} onChange={() => setModo('matriz')} disabled={!podeEditar} className="mt-1" />
          <span><span className="text-sm text-foreground">Matriz Impacto × Urgência</span> <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">padrão ITSM</span>
            <span className="block text-xs text-muted-foreground">Quem abre a OS informa o impacto e a urgência; o ATOS calcula a prioridade pela tabela abaixo.</span></span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name="modo" checked={modo === 'simples'} onChange={() => setModo('simples')} disabled={!podeEditar} className="mt-1" />
          <span><span className="text-sm text-foreground">Escolha direta</span>
            <span className="block text-xs text-muted-foreground">Quem abre a OS escolhe Crítico, Alto ou Baixo.</span></span>
        </label>
      </Card>

      {modo === 'matriz' && (
        <Card className="p-4">
          <p className="text-sm font-medium text-foreground mb-3">Matriz de prioridade</p>
          <div className="overflow-x-auto">
            <table className="text-sm" data-testid="matriz">
              <thead><tr><th className="p-2 text-left text-xs text-muted-foreground">Impacto \ Urgência</th>
                {URGENCIAS.map(u => <th key={u.value} className="p-2 text-xs text-muted-foreground font-medium">{u.label}</th>)}</tr></thead>
              <tbody>{IMPACTOS.map(i => (
                <tr key={i.value}><td className="p-2 text-xs text-foreground font-medium" title={i.descricao}>{i.label}</td>
                  {URGENCIAS.map(u => (
                    <td key={u.value} className="p-1.5">
                      <select aria-label={`Impacto ${i.label} × urgência ${u.label}`} value={matriz[i.value][u.value]} disabled={!podeEditar}
                        onChange={e => setMatriz({ ...matriz, [i.value]: { ...matriz[i.value], [u.value]: e.target.value } } as Matriz)}
                        className={cn('px-2 py-1.5 rounded-md bg-input border border-border text-sm font-medium', ESTILO_NIVEL[matriz[i.value][u.value]])}>
                        {NIVEIS_INCIDENTE.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                      </select>
                    </td>))}
                </tr>))}</tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Impacto: quanto da operação do cliente é afetado. Urgência: quanto o problema pode esperar.</p>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">Alerta de "em risco"</p>
        <div className="flex items-center gap-2 text-sm text-foreground">
          Avisar quando <Input aria-label="Percentual de risco" value={risco} onChange={e => setRisco(e.target.value.replace(/\D/g, '').slice(0, 2))} disabled={!podeEditar} className="w-16 text-center" />% do prazo tiver passado
        </div>
        <p className="text-[11px] text-muted-foreground">Ex.: prazo de 8 h com alerta em 75% → a OS fica "em risco" depois de 6 h. Vale também para as OS em aberto.</p>
        <p className="text-[11px] text-muted-foreground">Níveis por tipo: {TIPOS.map(t => `${t.label} → ${t.value === 'incidente' ? 'Crítico/Alto/Baixo' : t.value === 'visita' ? 'sem SLA' : ROTULO_NIVEL[t.value]}`).join(' · ')}</p>
      </Card>
      {podeEditar && (
        <div className="flex items-center gap-3">
          <Button variant="cta" loading={salvando} onClick={salvar}>Salvar</Button>
          {msg && <p className={'text-xs ' + (msg.ok ? 'text-green-400' : 'text-red-400')} data-testid="prioridades-msg">{msg.t}</p>}
        </div>
      )}
    </div>
  )
}

// ---------------- SLA ----------------
const SUGESTAO: Record<string, [number | null, number, number]> = {   // horas: resposta, atendimento, solução
  critico: [1, 4, 8], alto: [null, 8, 16], baixo: [null, 16, 40], preventiva: [null, 40, 80], requisicao: [null, 24, 48],
}
const paraHoras = (m?: number | null) => (m ? String(Math.round((m / 60) * 100) / 100).replace('.', ',') : '')
const paraMin = (h: string) => { const n = parseFloat(h.replace(',', '.')); return isFinite(n) && n > 0 ? Math.round(n * 60) : null }

interface FormMeta { id?: string; nivel: string; client_id: string; categoria_id: string; horario_id: string; resposta: string; atendimento: string; solucao: string }

function AbaSla({ podeEditar }: { podeEditar: boolean }) {
  const { tenant } = useAuth()
  const { politicas, carregando, recarregar } = usePoliticasSla()
  const { itens: horarios } = useHorariosAtendimento()
  const { opcoes: categoriasOp } = useCategorias()
  const { clients } = useClients()
  const [form, setForm] = useState<FormMeta | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const porCliente = tenant?.sla_por_cliente !== false

  const padrao = (nivel: string) => politicas.find(p => p.nivel === nivel && !p.client_id && !p.categoria_id)
  const excecoes = politicas.filter(p => p.client_id || p.categoria_id)
  const nomeHorario = (id: string | null) => id ? horarios.find(h => h.id === id)?.nome ?? '—' : 'Padrão da empresa'
  const nomeCliente = (id: string | null) => clients.find(c => c.id === id)?.name ?? '—'
  const nomeCategoria = (id: string | null) => categoriasOp.find(c => c.value === id)?.label ?? '—'

  function abrir(p: PoliticaSla | null, nivel = 'critico', excecao = false) {
    setErro('')
    setForm(p ? { id: p.id, nivel: p.nivel, client_id: p.client_id ?? '', categoria_id: p.categoria_id ?? '', horario_id: p.horario_id ?? '', resposta: paraHoras(p.resposta_min), atendimento: paraHoras(p.atendimento_min), solucao: paraHoras(p.solucao_min) }
      : { nivel, client_id: '', categoria_id: '', horario_id: '', resposta: '', atendimento: '', solucao: '' })
    setExcecaoAberta(excecao || !!(p && (p.client_id || p.categoria_id)))
  }
  const [excecaoAberta, setExcecaoAberta] = useState(false)

  async function salvar() {
    if (!form) return
    const at = paraMin(form.atendimento), so = paraMin(form.solucao), re = form.resposta.trim() ? paraMin(form.resposta) : null
    if (!at || !so) { setErro('Informe as horas de atendimento e de solução.'); return }
    if (so < at) { setErro('A solução não pode ter prazo menor que o atendimento.'); return }
    if (form.resposta.trim() && !re) { setErro('Resposta inválida.'); return }
    if (re && re > at) { setErro('A resposta não pode ter prazo maior que o atendimento.'); return }
    if (excecaoAberta && !form.client_id && !form.categoria_id) { setErro('Uma exceção precisa de um cliente ou de uma categoria.'); return }
    setSalvando(true)
    const dados = { nivel: form.nivel, client_id: form.client_id || null, categoria_id: form.categoria_id || null, horario_id: form.horario_id || null,
      resposta_min: re, atendimento_min: at, solucao_min: so, atualizado_em: new Date().toISOString() }
    const { error } = form.id ? await supabase.from('sla_politicas').update(dados).eq('id', form.id) : await supabase.from('sla_politicas').insert(dados)
    setSalvando(false)
    if (error) { setErro(error.code === '23505' ? 'Já existe uma meta para esta combinação.' : error.message); return }
    setForm(null); recarregar()
  }
  async function remover(p: PoliticaSla) {
    if (!confirm('Remover esta meta? OS novas deste nível ficam sem SLA (as já abertas mantêm o prazo).')) return
    await supabase.from('sla_politicas').delete().eq('id', p.id); recarregar()
  }
  async function preencherSugestao() {
    const faltando = NIVEIS_SLA.filter(n => !padrao(n.value))
    if (!faltando.length) return
    await supabase.from('sla_politicas').insert(faltando.map(n => {
      const [r, a, s] = SUGESTAO[n.value]
      return { nivel: n.value, resposta_min: r ? r * 60 : null, atendimento_min: a * 60, solucao_min: s * 60 }
    }))
    recarregar()
  }

  if (carregando) return <Loader2 className="animate-spin text-muted-foreground" size={18} />
  const semNenhuma = NIVEIS_SLA.every(n => !padrao(n.value))
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground max-w-2xl">
        Prazos em <b>horas úteis</b> do horário de atendimento (Calendários), descontando os feriados da cidade da unidade.
        <b> Resposta</b> (opcional): até designar o técnico · <b>Atendimento</b>: até o técnico iniciar · <b>Solução</b>: até concluir. Visita não tem SLA.
      </p>
      {semNenhuma && podeEditar && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3 border-primary/30">
          <p className="text-sm text-foreground">Nenhuma meta de SLA ainda — as OS ficam "Sem SLA".</p>
          <Button variant="outline" size="sm" onClick={preencherSugestao}><Sparkles size={14} /> Começar com valores sugeridos</Button>
        </Card>
      )}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="metas-sla">
          <thead><tr className="border-b border-border text-xs text-muted-foreground">
            <th className="text-left p-3 font-medium">Nível</th><th className="text-left p-3 font-medium">Horário</th>
            <th className="text-left p-3 font-medium">Resposta</th><th className="text-left p-3 font-medium">Atendimento</th><th className="text-left p-3 font-medium">Solução</th><th className="p-3" /></tr></thead>
          <tbody>
            {NIVEIS_SLA.map(n => {
              const p = padrao(n.value)
              return (
                <tr key={n.value} className="border-b border-border last:border-0" data-nivel={n.value}>
                  <td className={cn('p-3 font-medium', n.estilo)}>{n.label}</td>
                  <td className="p-3 text-muted-foreground">{p ? nomeHorario(p.horario_id) : '—'}</td>
                  <td className="p-3">{p ? minutosTexto(p.resposta_min) : '—'}</td>
                  <td className="p-3">{p ? minutosTexto(p.atendimento_min) : <span className="text-muted-foreground">Sem SLA</span>}</td>
                  <td className="p-3">{p ? minutosTexto(p.solucao_min) : '—'}</td>
                  <td className="p-3 text-right whitespace-nowrap">{podeEditar && (p
                    ? <><button title="Editar" onClick={() => abrir(p)} className={btnIcone + ' inline-flex'}><Pencil size={13} /></button><button title="Remover" onClick={() => remover(p)} className={btnIcone + ' inline-flex hover:text-red-400'}><Trash2 size={13} /></button></>
                    : <Button size="sm" variant="outline" onClick={() => abrir(null, n.value)}>Definir</Button>)}</td>
                </tr>)
            })}
            <tr><td className="p-3 text-muted-foreground">Visita</td><td colSpan={5} className="p-3 text-xs text-muted-foreground">Sem SLA</td></tr>
          </tbody>
        </table>
      </Card>

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Exceções por cliente ou categoria</p>
          <p className="text-xs text-muted-foreground">Prazos diferentes para um contrato ou tipo de serviço. A mais específica vence: cliente + categoria → cliente → categoria → nível.</p>
        </div>
        {podeEditar && <Button size="sm" variant="outline" className="whitespace-nowrap flex-shrink-0" onClick={() => abrir(null, 'critico', true)}><Plus size={14} /> Nova exceção</Button>}
      </div>
      {!porCliente && <p className="text-xs text-amber-300 flex items-center gap-1"><Lock size={12} /> Exceções por cliente não estão liberadas no seu plano.</p>}
      {excecoes.length > 0 && (
        <Card className="divide-y divide-border" data-testid="excecoes-sla">
          {excecoes.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="flex-1 min-w-0">
                <p className="text-foreground">{p.client_id ? nomeCliente(p.client_id) : 'Qualquer cliente'} · {p.categoria_id ? nomeCategoria(p.categoria_id) : 'qualquer categoria'} · <span className={cn('font-medium', ESTILO_NIVEL[p.nivel])}>{ROTULO_NIVEL[p.nivel]}</span></p>
                <p className="text-xs text-muted-foreground">Atendimento {minutosTexto(p.atendimento_min)} · Solução {minutosTexto(p.solucao_min)}{p.resposta_min ? ` · Resposta ${minutosTexto(p.resposta_min)}` : ''} · {nomeHorario(p.horario_id)}</p>
              </div>
              {podeEditar && <><button title="Editar" onClick={() => abrir(p)} className={btnIcone}><Pencil size={13} /></button><button title="Remover" onClick={() => remover(p)} className={btnIcone + ' hover:text-red-400'}><Trash2 size={13} /></button></>}
            </div>
          ))}
        </Card>
      )}

      <PreviaSla versao={JSON.stringify(politicas)} />

      <Modal open={!!form} onOpenChange={o => { if (!o) setForm(null) }} className="max-w-lg"
        title={excecaoAberta ? (form?.id ? 'Editar exceção' : 'Nova exceção de SLA') : `Meta de SLA — ${ROTULO_NIVEL[form?.nivel ?? ''] ?? ''}`}>
        {form && (
          <div className="space-y-4">
            {excecaoAberta && (<>
              <div>
                <Label htmlFor="exc-cliente">Cliente {!porCliente && <Lock size={11} className="inline" />}</Label>
                <Combobox id="exc-cliente" value={form.client_id} onChange={v => setForm({ ...form, client_id: v })}
                  options={[{ value: '', label: 'Qualquer cliente' }, ...(porCliente ? clients.map(c => ({ value: c.id, label: c.name })) : [])]} placeholder="Qualquer cliente" searchPlaceholder="Buscar cliente..." />
              </div>
              <div>
                <Label htmlFor="exc-categoria">Categoria</Label>
                <Combobox id="exc-categoria" value={form.categoria_id} onChange={v => setForm({ ...form, categoria_id: v })}
                  options={[{ value: '', label: 'Qualquer categoria' }, ...categoriasOp]} placeholder="Qualquer categoria" searchPlaceholder="Buscar categoria..." />
                <p className="text-[11px] text-muted-foreground mt-1">Uma categoria principal vale também para as subcategorias dela.</p>
              </div>
              <div>
                <Label htmlFor="exc-nivel">Nível</Label>
                <select id="exc-nivel" value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })} className={campo}>
                  {NIVEIS_SLA.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>
            </>)}
            <div>
              <Label htmlFor="meta-horario">Horário que conta</Label>
              <Combobox id="meta-horario" value={form.horario_id} onChange={v => setForm({ ...form, horario_id: v })}
                options={[{ value: '', label: 'Padrão da empresa' }, ...horarios.filter(h => h.ativo).map(h => ({ value: h.id, label: h.nome }))]} placeholder="Padrão da empresa" searchPlaceholder="Buscar..." />
              <p className="text-[11px] text-muted-foreground mt-1">Ex.: Crítico em "24x7" conta noites e fins de semana. Horários ficam em Calendários.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label htmlFor="meta-resposta">Resposta (h)</Label><Input id="meta-resposta" value={form.resposta} onChange={e => setForm({ ...form, resposta: e.target.value })} placeholder="opcional" inputMode="decimal" /></div>
              <div><Label htmlFor="meta-atendimento">Atendimento (h) *</Label><Input id="meta-atendimento" value={form.atendimento} onChange={e => setForm({ ...form, atendimento: e.target.value })} placeholder="4" inputMode="decimal" /></div>
              <div><Label htmlFor="meta-solucao">Solução (h) *</Label><Input id="meta-solucao" value={form.solucao} onChange={e => setForm({ ...form, solucao: e.target.value })} placeholder="8" inputMode="decimal" /></div>
            </div>
            <p className="text-[11px] text-muted-foreground">Use vírgula para frações (ex.: 0,5 = 30 min).</p>
            {erro && <p className="text-sm text-red-400">{erro}</p>}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button variant="cta" loading={salvando} onClick={salvar}>Salvar</Button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// "Se abrir agora, vence em…" — mesma função que a OS usa
function PreviaSla({ versao }: { versao: string }) {   // versao: recalcula quando as metas mudam
  const [nivel, setNivel] = useState('critico')
  const [r, setR] = useState<any>(null)
  useEffect(() => {
    const tipo = ['critico', 'alto', 'baixo'].includes(nivel) ? 'incidente' : nivel
    supabase.rpc('previa_sla', { p_tipo: tipo, p_impacto: null, p_urgencia: null, p_prioridade: nivel, p_client: null, p_categoria: null, p_location: null })
      .then(({ data }) => setR(data))
  }, [nivel, versao])
  return (
    <Card className="p-4 space-y-2" data-testid="previa-sla">
      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        Se uma OS
        <select aria-label="Nível da prévia" value={nivel} onChange={e => setNivel(e.target.value)} className="px-2 py-1.5 rounded-md bg-input border border-border text-sm">
          {NIVEIS_SLA.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
        </select>
        fosse aberta agora:
      </div>
      {!r ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : !r.sla ? (
        <p className="text-xs text-muted-foreground">Sem SLA para este nível.</p>
      ) : (
        <p className="text-sm text-foreground" data-testid="previa-sla-texto">
          {r.resposta ? <>Resposta até <b>{dataHora(r.resposta)}</b> · </> : null}Atendimento até <b>{dataHora(r.atendimento)}</b> · Solução até <b>{dataHora(r.solucao)}</b>
        </p>
      )}
    </Card>
  )
}

// ---------------- Motivos de pausa ----------------
function AbaPausas({ podeEditar }: { podeEditar: boolean }) {
  const { motivos, carregando, recarregar } = useMotivosPausa()
  const [novo, setNovo] = useState('')
  const [para, setPara] = useState(false)
  const [erro, setErro] = useState('')
  async function adicionar() {
    if (novo.trim().length < 2) { setErro('Informe o motivo.'); return }
    const { error } = await supabase.from('motivos_pausa').insert({ nome: novo.trim(), para_sla: para, ordem: 5 })
    if (error) { setErro(error.code === '23505' ? 'Esse motivo já existe.' : error.message); return }
    setNovo(''); setPara(false); setErro(''); recarregar()
  }
  async function atualizar(m: MotivoPausa, dados: Partial<MotivoPausa>) { await supabase.from('motivos_pausa').update(dados).eq('id', m.id); recarregar() }
  const ativos = useMemo(() => motivos, [motivos])
  if (carregando) return <Loader2 className="animate-spin text-muted-foreground" size={18} />
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground max-w-2xl">Ao pausar uma OS, o técnico escolhe um destes motivos. Os que <b>param o relógio</b> não contam no prazo de solução (ex.: aguardando o cliente) — os demais continuam contando (ex.: falta de peça da própria empresa).</p>
      <Card className="divide-y divide-border">
        {ativos.map(m => (
          <div key={m.id} className={cn('flex items-center gap-3 px-4 py-2.5', !m.ativo && 'opacity-50')} data-motivo={m.nome}>
            <p className="flex-1 text-sm text-foreground">{m.nome}</p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={m.para_sla} disabled={!podeEditar} onChange={e => atualizar(m, { para_sla: e.target.checked })} aria-label={'Para o relógio: ' + m.nome} />
              Para o relógio do SLA
            </label>
            {podeEditar && <button title={m.ativo ? 'Desativar' : 'Ativar'} onClick={() => atualizar(m, { ativo: !m.ativo })} className={btnIcone}><Power size={13} /></button>}
          </div>
        ))}
      </Card>
      {podeEditar && (
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <Input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Novo motivo de pausa" className="flex-1 min-w-[200px]" aria-label="Novo motivo" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={para} onChange={e => setPara(e.target.checked)} /> Para o relógio</label>
          <Button size="sm" variant="cta" onClick={adicionar}><Plus size={14} /> Adicionar</Button>
          {erro && <p className="w-full text-xs text-red-400">{erro}</p>}
        </Card>
      )}
    </div>
  )
}
