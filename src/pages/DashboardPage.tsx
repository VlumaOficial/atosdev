import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { useClients } from '@/hooks/useClients'
import { useTechnicians } from '@/hooks/useTechnicians'
import { useCategorias } from '@/hooks/useCatalogoSla'
import FiltrosLista from '@/components/FiltrosLista'
import GraficoEvolucao, { type Balde } from '@/components/painel/GraficoEvolucao'
import { Card } from '@/components/ui/card'
import { intervaloDoPeriodo, type ChavePeriodo } from '@/lib/periodo'
import { hojeNoFuso, dataBR } from '@/lib/recorrencia'
import { nomeEmpresa } from '@/lib/empresa'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, Clock, UserX, Flame, CalendarX, ArrowUp, ArrowDown, Minus, CheckCircle2, Loader2,
  PenLine, Camera, Send, Repeat,
} from 'lucide-react'

// F7 — Painel gerencial (KPIs aprovados em 2026-09-25, VISAO_ATOS.md):
// "Agora" (o que pede ação, clicável até a lista filtrada) → desempenho do
// período com meta e variação → evolução → equipe → clientes →
// preventivas → comprovação do serviço. Uma chamada ao banco
// (painel_gerencial); filtros na URL. Só admin/gestor (técnico tem o app).

interface Desempenho {
  abertas: number; concluidas: number; sla_total: number; sla_ok: number; mtta_min: number | null; mttr_min: number | null
  inc_total: number; inc_primeira: number; com_assinatura: number; com_foto: number; com_relatorio: number
}
interface Painel {
  periodo: { de: string; ate: string; hoje: string; dias: number; semanal: boolean; ant_de: string; ant_ate: string }
  meta_sla: number
  agora: { vencidos: number; em_risco: number; sem_tecnico: number; criticos_altos: number; checklists_atrasados: number; os_preventivas_vencidas: number; em_aberto: number }
  atual: Desempenho; anterior: Desempenho
  idade_backlog: { ate2: number; de3a7: number; de8a15: number; mais15: number }
  evolucao: Balde[]
  equipe: { id: string; nome: string; carga: number; concluidas: number; sla_total: number; sla_ok: number; mttr_min: number | null; inc_total: number; inc_primeira: number }[]
  clientes: { id: string; nome: string; volume: number; concluidas: number; sla_total: number; sla_ok: number; unidades_reincidentes: number }[]
  reincidencias: { unidade: string; cliente: string; qtd: number }[]
  preventivas: { ck_devidos: number; ck_no_prazo: number; ck_atrasados: number; os_preventivas: number; checklists: number; corretivas: number }
}

// cores de situação (status reservado: sempre com ícone + texto)
const BOM = '#0ca30c', ALERTA = '#fab219', CRITICO = '#d03b3b'

const pct = (ok: number, total: number) => (total > 0 ? Math.round((ok / total) * 100) : null)
function horas(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—'
  if (min < 60) return `${min} min`
  return `${(min / 60).toFixed(min < 600 ? 1 : 0).replace('.', ',')} h`
}

export default function DashboardPage() {
  const { user, tenant } = useAuth()
  if (user?.role !== 'admin' && user?.role !== 'gestor') {
    return (
      <div>
        <h1 className="text-xl font-bold text-foreground">Olá, {user?.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground text-sm mt-1">{tenant ? nomeEmpresa(tenant) : 'VLUMA Tecnologia — Super Admin'}</p>
        <Card className="p-8 mt-6 text-center text-sm text-muted-foreground">O painel gerencial é das empresas. Use o menu para administrar a plataforma.</Card>
      </div>
    )
  }
  return <PainelGerencial />
}

function PainelGerencial() {
  const { tenant } = useAuth()
  const hoje = hojeNoFuso(tenant?.fuso_horario)
  const { valores: f, definir, limpar } = useFiltrosUrl({ per: 'mes', de: '', ate: '', cli: '', tec: '', cat: '' })
  const periodo = intervaloDoPeriodo(f.per as ChavePeriodo, hoje, f.de, f.ate)
  const { clients } = useClients()
  const { technicians } = useTechnicians()
  const { opcoes: categoriasOp } = useCategorias()
  const [dados, setDados] = useState<Painel | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const chave = JSON.stringify([periodo.de, periodo.ate, f.cli, f.tec, f.cat])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    const p: Record<string, string> = {}
    if (periodo.de) p.de = periodo.de
    if (periodo.ate) p.ate = periodo.ate
    if (f.cli) p.cliente = f.cli
    if (f.tec) p.tecnico = f.tec
    if (f.cat) p.categoria = f.cat
    supabase.rpc('painel_gerencial', { p }).then(({ data, error }) => {
      if (!vivo) return
      if (error) setErro(error.message); else { setErro(''); setDados(data as Painel) }
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps

  // links levam à lista já filtrada (mesmos filtros de cliente/técnico)
  const extras = useMemo(() => {
    const q = new URLSearchParams()
    if (f.cli) q.set('cli', f.cli)
    if (f.tec) q.set('tec', f.tec)
    if (f.cat) q.set('cat', f.cat)
    return q
  }, [f.cli, f.tec, f.cat])
  const linkOS = (mais: Record<string, string>) => { const q = new URLSearchParams(extras); for (const [k, v] of Object.entries(mais)) q.set(k, v); return '/os?' + q.toString() }
  // OS concluídas no período (os indicadores de desempenho contam pela data de conclusão)
  const linkConcl = (mais: Record<string, string> = {}) => linkOS({ sit: 'concluida', per: 'personalizado', de: dados?.periodo.de ?? '', ate: dados?.periodo.ate ?? '', por: 'conclusao', ...mais })
  const linkCk = () => { const q = new URLSearchParams({ sit: 'atrasado' }); if (f.cli) q.set('cli', f.cli); if (f.tec) q.set('tec', f.tec); return '/checklists/avulsos?' + q.toString() }

  const campos = [
    { chave: 'cli', rotulo: 'Cliente', opcoes: clients.map(c => ({ value: c.id, label: c.name })), vazio: 'Todos os clientes' },
    { chave: 'tec', rotulo: 'Técnico', opcoes: technicians.map(t => ({ value: t.id, label: t.name })), vazio: 'Todos os técnicos' },
    { chave: 'cat', rotulo: 'Categoria', opcoes: categoriasOp, vazio: 'Todas as categorias' },
  ]

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-foreground">Painel gerencial</h1>
        <p className="text-muted-foreground text-sm mt-1">{tenant ? nomeEmpresa(tenant) : ''}{dados ? ` · ${dataBR(dados.periodo.de)} a ${dataBR(dados.periodo.ate)}` : ''}</p>
      </div>
      <FiltrosLista campos={campos} valores={{ cli: f.cli, tec: f.tec, cat: f.cat }}
        onChange={(k, v) => definir({ [k]: v })}
        periodo={{ valor: f.per as ChavePeriodo, de: f.de, ate: f.ate, onChange: (per, de, ate) => definir({ per, de: per === 'personalizado' ? (de ?? '') : '', ate: per === 'personalizado' ? (ate ?? '') : '' }) }}
        onLimpar={() => limpar()} />
      {erro && <Card className="p-4 text-sm text-red-400">{erro}</Card>}
      {!dados ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div> : (
        <div className={cn('space-y-6 transition-opacity', carregando && 'opacity-60')} data-testid="painel">
          <Agora d={dados} linkOS={linkOS} linkCk={linkCk} />
          <Desempenho d={dados} linkConcl={linkConcl} />
          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <Card className="p-4 lg:col-span-2">
              <p className="text-sm font-medium text-foreground mb-3">Evolução no período</p>
              <GraficoEvolucao dados={dados.evolucao} meta={dados.meta_sla} semanal={dados.periodo.semanal} />
            </Card>
            <IdadeBacklog d={dados} linkOS={linkOS} />
          </div>
          <Equipe d={dados} />
          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <Clientes d={dados} />
            <Reincidencia d={dados} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Preventivas d={dados} linkCk={linkCk} />
            <Comprovacao d={dados} />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Agora ----------
function Agora({ d, linkOS, linkCk }: { d: Painel; linkOS: (m: Record<string, string>) => string; linkCk: () => string }) {
  const a = d.agora
  const cards = [
    { k: 'vencidos', rotulo: 'SLA vencido', valor: a.vencidos, icone: AlertTriangle, cor: CRITICO, link: linkOS({ sit: 'em_aberto', sla: 'vencido' }) },
    { k: 'risco', rotulo: 'SLA em risco', valor: a.em_risco, icone: Clock, cor: ALERTA, link: linkOS({ sit: 'em_aberto', sla: 'em_risco' }) },
    { k: 'semtec', rotulo: 'Sem técnico', valor: a.sem_tecnico, icone: UserX, cor: ALERTA, link: linkOS({ sit: 'em_aberto', tec: 'sem' }) },
    { k: 'crit', rotulo: 'Crítico/Alto em aberto', valor: a.criticos_altos, icone: Flame, cor: CRITICO, link: linkOS({ sit: 'em_aberto', pri: 'critico,alto' }) },
    { k: 'prev', rotulo: 'Preventivas atrasadas', valor: a.checklists_atrasados + a.os_preventivas_vencidas, icone: CalendarX, cor: ALERTA, link: linkCk() },
  ]
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold text-foreground">Agora</h2>
        <Link to={linkOS({ sit: 'em_aberto' })} className="text-xs text-primary hover:underline">{a.em_aberto} OS em aberto →</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 [&>*]:min-w-0">
        {cards.map(c => (
          <Link key={c.k} to={c.link} data-agora={c.k}
            className="rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><c.icone size={14} style={{ color: c.valor > 0 ? c.cor : undefined }} /> {c.rotulo}</div>
            <p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">{c.valor}</p>
            <p className="text-[11px] text-muted-foreground">{c.valor > 0 ? 'Ver lista →' : 'Nada pendente'}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ---------- Desempenho ----------
function Variacao({ atual, anterior, tipo, menorMelhor }: { atual: number | null; anterior: number | null; tipo: 'pp' | 'pct'; menorMelhor?: boolean }) {
  if (atual === null || anterior === null) return <span className="text-[11px] text-muted-foreground">sem comparação</span>
  let delta: number
  if (tipo === 'pp') delta = atual - anterior
  else { if (anterior === 0) return <span className="text-[11px] text-muted-foreground">sem base anterior</span>; delta = Math.round(((atual - anterior) / anterior) * 100) }
  if (delta === 0) return <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5"><Minus size={11} /> igual ao período anterior</span>
  const bom = menorMelhor ? delta < 0 : delta > 0
  const Seta = delta > 0 ? ArrowUp : ArrowDown
  return (
    <span className="text-[11px] inline-flex items-center gap-0.5" style={{ color: bom ? BOM : CRITICO }}>
      <Seta size={11} />{Math.abs(delta)}{tipo === 'pp' ? ' p.p.' : '%'} <span className="text-muted-foreground ml-1">vs anterior</span>
    </span>
  )
}

function Kpi({ rotulo, valor, sub, variacao, destaque, testid, link }: { rotulo: string; valor: string; sub?: React.ReactNode; variacao?: React.ReactNode; destaque?: React.ReactNode; testid?: string; link?: React.ReactNode }) {
  return (
    <Card className="p-4" data-kpi={testid}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <div className="flex flex-wrap items-baseline gap-x-2 mt-1"><p className="text-2xl font-semibold text-foreground tabular-nums">{valor}</p>{destaque}</div>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      {variacao && <div className="mt-1">{variacao}</div>}
      {link && <div className="mt-1.5">{link}</div>}
    </Card>
  )
}

function Desempenho({ d, linkConcl }: { d: Painel; linkConcl: (m?: Record<string, string>) => string }) {
  const a = d.atual, b = d.anterior
  const sla = pct(a.sla_ok, a.sla_total), slaAnt = pct(b.sla_ok, b.sla_total)
  const fv = pct(a.inc_primeira, a.inc_total), fvAnt = pct(b.inc_primeira, b.inc_total)
  const situacao = sla === null ? null : sla >= d.meta_sla ? { t: 'Na meta', c: BOM, I: CheckCircle2 } : sla >= d.meta_sla - 10 ? { t: 'Abaixo da meta', c: ALERTA, I: AlertTriangle } : { t: 'Longe da meta', c: CRITICO, I: AlertTriangle }
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-2">Desempenho do período <span className="text-xs font-normal text-muted-foreground">· comparado a {dataBR(d.periodo.ant_de)}–{dataBR(d.periodo.ant_ate)}</span></h2>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 [&>*]:min-w-0">
        <Kpi testid="sla" rotulo="SLA cumprido" valor={sla === null ? '—' : `${sla}%`}
          destaque={situacao && <span className="text-[11px] inline-flex items-center gap-0.5 whitespace-nowrap" style={{ color: situacao.c }}><situacao.I size={12} />{situacao.t}</span>}
          sub={a.sla_total ? `${a.sla_ok} de ${a.sla_total} OS com SLA · meta ${d.meta_sla}%` : `Nenhuma OS com SLA concluída · meta ${d.meta_sla}%`}
          variacao={<Variacao atual={sla} anterior={slaAnt} tipo="pp" />}
          link={a.sla_total > a.sla_ok ? <Link to={linkConcl({ sla: 'violado' })} className="text-[11px] text-primary hover:underline">Ver {a.sla_total - a.sla_ok} fora do prazo →</Link> : undefined} />
        <Kpi testid="concluidas" rotulo="OS concluídas" valor={String(a.concluidas)} sub={`${a.abertas} abertas no período`}
          variacao={<Variacao atual={a.concluidas} anterior={b.concluidas} tipo="pct" />}
          link={a.concluidas > 0 ? <Link to={linkConcl()} className="text-[11px] text-primary hover:underline">Ver concluídas →</Link> : undefined} />
        <Kpi testid="mtta" rotulo="Tempo médio até o atendimento" valor={horas(a.mtta_min)} sub="abertura → início, horas úteis"
          variacao={<Variacao atual={a.mtta_min} anterior={b.mtta_min} tipo="pct" menorMelhor />} />
        <Kpi testid="mttr" rotulo="Tempo médio de solução" valor={horas(a.mttr_min)} sub="abertura → conclusão, horas úteis"
          variacao={<Variacao atual={a.mttr_min} anterior={b.mttr_min} tipo="pct" menorMelhor />} />
        <Kpi testid="fv" rotulo="Resolução na 1ª visita" valor={fv === null ? '—' : `${fv}%`} sub={a.inc_total ? `${a.inc_primeira} de ${a.inc_total} incidentes` : 'nenhum incidente concluído'}
          variacao={<Variacao atual={fv} anterior={fvAnt} tipo="pp" />} />
      </div>
    </section>
  )
}

// ---------- Idade do backlog ----------
function IdadeBacklog({ d, linkOS }: { d: Painel; linkOS: (m: Record<string, string>) => string }) {
  const i = d.idade_backlog
  const faixas = [['Até 2 dias', i.ate2], ['3 a 7 dias', i.de3a7], ['8 a 15 dias', i.de8a15], ['Mais de 15 dias', i.mais15]] as const
  const max = Math.max(1, ...faixas.map(x => x[1]))
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-foreground">Idade das OS em aberto</p>
      <p className="text-[11px] text-muted-foreground mb-3">Quanto mais à direita, mais tempo esperando</p>
      <div className="space-y-2.5" data-testid="idade-backlog">
        {faixas.map(([r, v]) => (
          <div key={r}>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">{r}</span><span className="text-foreground tabular-nums">{v}</span></div>
            <div className="h-2 rounded bg-secondary mt-1 overflow-hidden"><div className="h-full rounded" style={{ width: `${(v / max) * 100}%`, background: '#3987e5' }} /></div>
          </div>
        ))}
      </div>
      <Link to={linkOS({ sit: 'em_aberto' })} className="text-[11px] text-primary hover:underline mt-3 inline-block">Ver OS em aberto →</Link>
    </Card>
  )
}

// ---------- Equipe ----------
function Equipe({ d }: { d: Painel }) {
  const linhas = [...d.equipe].sort((a, b) => b.carga - a.carga || b.concluidas - a.concluidas)
  const mediaCarga = linhas.length ? linhas.reduce((s, x) => s + x.carga, 0) / linhas.length : 0
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-foreground mb-3">Equipe</p>
      {linhas.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum técnico ativo.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="tabela-equipe">
            <thead><tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left p-2 font-medium">Técnico</th><th className="text-right p-2 font-medium">Em aberto agora</th><th className="text-right p-2 font-medium">Concluídas</th>
              <th className="text-right p-2 font-medium">SLA cumprido</th><th className="text-right p-2 font-medium">Tempo médio de solução</th><th className="text-right p-2 font-medium">1ª visita</th></tr></thead>
            <tbody>{linhas.map(t => {
              const sobrecarga = t.carga >= 3 && t.carga > mediaCarga * 1.5
              const s = pct(t.sla_ok, t.sla_total), fv = pct(t.inc_primeira, t.inc_total)
              return (
                <tr key={t.id} className="border-b border-border/50 last:border-0">
                  <td className="p-2 text-foreground"><Link to={`/os?sit=em_aberto&tec=${t.id}`} className="hover:underline">{t.nome}</Link></td>
                  <td className="p-2 text-right tabular-nums">{t.carga}{sobrecarga && <span className="ml-1.5 text-[11px] inline-flex items-center gap-0.5" style={{ color: ALERTA }}><AlertTriangle size={11} />sobrecarregado</span>}</td>
                  <td className="p-2 text-right tabular-nums">{t.concluidas}</td>
                  <td className="p-2 text-right tabular-nums">{s === null ? '—' : `${s}%`}</td>
                  <td className="p-2 text-right tabular-nums">{horas(t.mttr_min)}</td>
                  <td className="p-2 text-right tabular-nums">{fv === null ? '—' : `${fv}%`}</td>
                </tr>)
            })}</tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-2">"Sobrecarregado": 3 ou mais OS em aberto e 50% acima da média da equipe.</p>
    </Card>
  )
}

// ---------- Clientes ----------
function Clientes({ d }: { d: Painel }) {
  return (
    <Card className="p-4 lg:col-span-2">
      <p className="text-sm font-medium text-foreground mb-3">Clientes com mais OS no período</p>
      {d.clientes.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma OS no período.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="tabela-clientes">
            <thead><tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left p-2 font-medium">Cliente</th><th className="text-right p-2 font-medium">OS abertas</th><th className="text-right p-2 font-medium">Concluídas</th>
              <th className="text-right p-2 font-medium">SLA cumprido</th><th className="text-right p-2 font-medium">Unidades reincidentes</th></tr></thead>
            <tbody>{d.clientes.map(c => {
              const s = pct(c.sla_ok, c.sla_total)
              return (
                <tr key={c.id} className="border-b border-border/50 last:border-0">
                  <td className="p-2 text-foreground"><Link to={`/os?sit=todas&cli=${c.id}`} className="hover:underline">{c.nome}</Link></td>
                  <td className="p-2 text-right tabular-nums">{c.volume}</td>
                  <td className="p-2 text-right tabular-nums">{c.concluidas}</td>
                  <td className="p-2 text-right tabular-nums">{s === null ? '—' : `${s}%`}</td>
                  <td className="p-2 text-right tabular-nums">{c.unidades_reincidentes || '—'}</td>
                </tr>)
            })}</tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function Reincidencia({ d }: { d: Painel }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-foreground">Reincidência</p>
      <p className="text-[11px] text-muted-foreground mb-3">Unidades com 2 ou mais incidentes no período — sinal de problema que não foi resolvido de vez</p>
      {d.reincidencias.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma unidade reincidente.</p> : (
        <ul className="space-y-2" data-testid="reincidencias">
          {d.reincidencias.map(r => (
            <li key={r.unidade + r.cliente} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0"><span className="text-foreground block truncate">{r.unidade}</span><span className="text-[11px] text-muted-foreground">{r.cliente}</span></span>
              <span className="text-foreground tabular-nums flex-shrink-0">{r.qtd} OS</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---------- Preventivas ----------
function Preventivas({ d, linkCk }: { d: Painel; linkCk: () => string }) {
  const p = d.preventivas
  const plano = pct(p.ck_no_prazo, p.ck_devidos)
  const prev = p.checklists + p.os_preventivas
  const total = prev + p.corretivas
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-1.5"><Repeat size={14} className="text-primary" /> Preventivas</p>
      {p.ck_devidos === 0 && prev === 0 ? (
        <p className="text-xs text-muted-foreground">Sem preventivas no período. Programe checklists recorrentes em "Checklists avulsos" ou abra OS do tipo Preventiva.</p>
      ) : (<>
        <div className="flex items-baseline gap-2"><p className="text-2xl font-semibold text-foreground tabular-nums" data-testid="plano-preventivo">{plano === null ? '—' : `${plano}%`}</p><p className="text-xs text-muted-foreground">do plano feito no prazo</p></div>
        <p className="text-[11px] text-muted-foreground">{p.ck_no_prazo} de {p.ck_devidos} checklists previstos até hoje · <Link to={linkCk()} className="text-primary hover:underline">{p.ck_atrasados} atrasados</Link></p>
        {total > 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-1">Corretivas × preventivas no período</p>
            <div className="flex h-2.5 rounded overflow-hidden gap-[2px]">
              {p.corretivas > 0 && <div style={{ width: `${(p.corretivas / total) * 100}%`, background: '#d95926' }} />}
              {prev > 0 && <div style={{ width: `${(prev / total) * 100}%`, background: '#3987e5' }} />}
            </div>
            <div className="flex justify-between text-[11px] mt-1">
              <span className="inline-flex items-center gap-1 text-muted-foreground"><span className="w-2 h-2 rounded-sm" style={{ background: '#d95926' }} />{p.corretivas} corretivas (incidentes)</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground"><span className="w-2 h-2 rounded-sm" style={{ background: '#3987e5' }} />{prev} preventivas</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Mais preventivas que corretivas indica manutenção planejada.</p>
          </div>
        )}
      </>)}
    </Card>
  )
}

// ---------- Comprovação ----------
function Comprovacao({ d }: { d: Painel }) {
  const a = d.atual
  const itens = [
    { r: 'Com assinatura do cliente', v: a.com_assinatura, I: PenLine },
    { r: 'Com foto (evidência ou checklist)', v: a.com_foto, I: Camera },
    { r: 'Com relatório enviado ao cliente', v: a.com_relatorio, I: Send },
  ]
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-foreground">Comprovação do serviço</p>
      <p className="text-[11px] text-muted-foreground mb-3">Das {a.concluidas} OS concluídas no período</p>
      {a.concluidas === 0 ? <p className="text-xs text-muted-foreground">Nenhuma OS concluída no período.</p> : (
        <div className="space-y-3" data-testid="comprovacao">
          {itens.map(x => {
            const p = pct(x.v, a.concluidas) ?? 0
            return (
              <div key={x.r}>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground inline-flex items-center gap-1.5"><x.I size={12} />{x.r}</span><span className="text-foreground tabular-nums">{p}% <span className="text-muted-foreground">({x.v})</span></span></div>
                <div className="h-2 rounded bg-secondary mt-1 overflow-hidden"><div className="h-full rounded" style={{ width: `${p}%`, background: '#3987e5' }} /></div>
              </div>)
          })}
        </div>
      )}
    </Card>
  )
}

