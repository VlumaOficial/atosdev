// SLA no padrão ITSM (migration 044). Os PRAZOS são calculados e gravados
// no banco (gatilho fn_orders_sla); aqui só rótulos, situação (mesma regra
// de public.sla_situacao) e textos como "vence em 2 h".

export type TipoOS = 'incidente' | 'requisicao' | 'preventiva' | 'visita'
export type NivelOS = 'critico' | 'alto' | 'baixo' | 'preventiva' | 'requisicao' | 'visita'
export type Impacto = 'alto' | 'medio' | 'baixo'
export type Urgencia = 'alta' | 'media' | 'baixa'
export type SituacaoSla = 'sem_sla' | 'cancelada' | 'cumprido' | 'violado' | 'pausado' | 'vencido' | 'em_risco' | 'no_prazo'

export const TIPOS: { value: TipoOS; label: string; descricao: string }[] = [
  { value: 'incidente', label: 'Incidente', descricao: 'Algo parou ou falhou (corretiva)' },
  { value: 'requisicao', label: 'Requisição', descricao: 'Pedido do cliente (instalação, mudança, serviço)' },
  { value: 'preventiva', label: 'Preventiva', descricao: 'Manutenção planejada' },
  { value: 'visita', label: 'Visita', descricao: 'Visita técnica ou orçamento — sem SLA' },
]
export const ROTULO_TIPO: Record<string, string> = Object.fromEntries(TIPOS.map(t => [t.value, t.label]))

export const NIVEIS: { value: NivelOS; label: string; estilo: string }[] = [
  { value: 'critico', label: 'Crítico', estilo: 'text-red-400' },
  { value: 'alto', label: 'Alto', estilo: 'text-amber-400' },
  { value: 'baixo', label: 'Baixo', estilo: 'text-muted-foreground' },
  { value: 'preventiva', label: 'Preventiva', estilo: 'text-sky-400' },
  { value: 'requisicao', label: 'Requisição', estilo: 'text-violet-400' },
  { value: 'visita', label: 'Visita', estilo: 'text-muted-foreground' },
]
export const ROTULO_NIVEL: Record<string, string> = Object.fromEntries(NIVEIS.map(n => [n.value, n.label]))
export const ESTILO_NIVEL: Record<string, string> = Object.fromEntries(NIVEIS.map(n => [n.value, n.estilo]))
// níveis que têm meta de SLA configurável (Visita não tem)
export const NIVEIS_SLA = NIVEIS.filter(n => n.value !== 'visita')
export const NIVEIS_INCIDENTE = NIVEIS.filter(n => ['critico', 'alto', 'baixo'].includes(n.value))

export const IMPACTOS: { value: Impacto; label: string; descricao: string }[] = [
  { value: 'alto', label: 'Alto', descricao: 'Parou a operação ou afeta várias pessoas/unidades' },
  { value: 'medio', label: 'Médio', descricao: 'Afeta parte da operação' },
  { value: 'baixo', label: 'Baixo', descricao: 'Afeta pouco ou uma pessoa' },
]
export const URGENCIAS: { value: Urgencia; label: string; descricao: string }[] = [
  { value: 'alta', label: 'Alta', descricao: 'Precisa ser resolvido já' },
  { value: 'media', label: 'Média', descricao: 'Pode esperar algumas horas' },
  { value: 'baixa', label: 'Baixa', descricao: 'Pode ser programado' },
]
export type Matriz = Record<Impacto, Record<Urgencia, 'critico' | 'alto' | 'baixo'>>
export const MATRIZ_PADRAO: Matriz = {
  alto: { alta: 'critico', media: 'alto', baixa: 'alto' },
  medio: { alta: 'alto', media: 'alto', baixa: 'baixo' },
  baixo: { alta: 'alto', media: 'baixo', baixa: 'baixo' },
}

// nível que a OS terá (mesma regra do gatilho no banco)
export function nivelDaOS(tipo: TipoOS, modo: 'matriz' | 'simples', matriz: Matriz | undefined, impacto?: string | null, urgencia?: string | null, prioridade?: string | null): NivelOS {
  if (tipo !== 'incidente') return tipo
  if (modo === 'matriz' && impacto && urgencia) return (matriz ?? MATRIZ_PADRAO)[impacto as Impacto][urgencia as Urgencia]
  return prioridade && ['critico', 'alto', 'baixo'].includes(prioridade) ? prioridade as NivelOS : 'baixo'
}

export interface CamposSla {
  status: string
  prazo_resposta?: string | null
  prazo_atendimento?: string | null
  prazo_solucao?: string | null
  risco_atendimento?: string | null
  risco_solucao?: string | null
  respondido_em?: string | null
  atendido_em?: string | null
  sla_pausado_desde?: string | null
  sla_atendimento_ok?: boolean | null
  sla_solucao_ok?: boolean | null
  sla_resposta_ok?: boolean | null
}

const t = (s?: string | null) => (s ? new Date(s).getTime() : NaN)

export function situacaoSla(o: CamposSla, agora = Date.now()): SituacaoSla {
  if (!o.prazo_solucao) return 'sem_sla'
  if (o.status === 'cancelada') return 'cancelada'
  if (o.status === 'concluida') return (o.sla_solucao_ok ?? true) && (o.sla_atendimento_ok ?? true) && (o.sla_resposta_ok ?? true) ? 'cumprido' : 'violado'
  if (o.sla_pausado_desde) return 'pausado'
  const resp = o.prazo_resposta ? (o.respondido_em ? t(o.respondido_em) : agora) > t(o.prazo_resposta) : false
  const atend = (o.atendido_em ? t(o.atendido_em) : agora) > t(o.prazo_atendimento)
  if (resp || atend || agora > t(o.prazo_solucao)) return 'vencido'
  if ((!o.atendido_em && agora > t(o.risco_atendimento)) || agora > t(o.risco_solucao)) return 'em_risco'
  return 'no_prazo'
}

export const ROTULO_SITUACAO: Record<SituacaoSla, string> = {
  sem_sla: 'Sem SLA', cancelada: '—', cumprido: 'SLA cumprido', violado: 'SLA violado', pausado: 'SLA pausado',
  vencido: 'Vencido', em_risco: 'Em risco', no_prazo: 'No prazo',
}
export const ESTILO_SITUACAO: Record<SituacaoSla, string> = {
  sem_sla: 'text-muted-foreground bg-secondary border-border',
  cancelada: 'text-muted-foreground bg-secondary border-border',
  cumprido: 'text-green-400 bg-green-500/10 border-green-500/30',
  violado: 'text-red-400 bg-red-500/10 border-red-500/30',
  pausado: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  vencido: 'text-red-400 bg-red-500/10 border-red-500/30',
  em_risco: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  no_prazo: 'text-green-400 bg-green-500/10 border-green-500/30',
}

// o próximo prazo que importa: atendimento (se ainda não iniciou) ou solução
export function proximoPrazo(o: CamposSla): string | null {
  if (!o.prazo_solucao || o.status === 'concluida' || o.status === 'cancelada') return null
  if (!o.atendido_em && o.prazo_atendimento) return o.prazo_atendimento
  return o.prazo_solucao
}

function duracao(ms: number): string {
  const min = Math.round(Math.abs(ms) / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`
  return `${Math.round(h / 24)} dias`
}

// "vence em 2 h" / "venceu há 30 min" (relógio corrido — o prazo já está em horas úteis)
export function textoVencimento(o: CamposSla, agora = Date.now()): string | null {
  const p = proximoPrazo(o)
  if (!p) return null
  if (o.sla_pausado_desde) return 'relógio pausado'
  const d = t(p) - agora
  const qual = !o.atendido_em ? 'atendimento' : 'solução'
  return d >= 0 ? `${qual} vence em ${duracao(d)}` : `${qual} venceu há ${duracao(d)}`
}

export function dataHora(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// minutos ⇄ "4 h" / "1 h 30 min" para a tela de configuração
export function minutosTexto(min?: number | null): string {
  if (!min) return '—'
  const h = Math.floor(min / 60), m = min % 60
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`
}
