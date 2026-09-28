import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import {
  situacaoSla, textoVencimento, dataHora, ROTULO_SITUACAO, ESTILO_SITUACAO, ROTULO_TIPO, ROTULO_NIVEL, ESTILO_NIVEL,
  type CamposSla,
} from '@/lib/sla'
import { Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

// Selo e cartão de SLA da OS (migration 044) — admin e técnico

// re-renderiza a cada minuto para "vence em…" andar sozinho
function useAgora() {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => { const i = setInterval(() => setAgora(Date.now()), 60000); return () => clearInterval(i) }, [])
  return agora
}

export function SeloSla({ o, comTexto = false }: { o: CamposSla; comTexto?: boolean }) {
  const agora = useAgora()
  const s = situacaoSla(o, agora)
  if (s === 'cancelada') return null
  const txt = comTexto ? textoVencimento(o, agora) : null
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap" data-sla={s}>
      <span className={cn('inline-block px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap', ESTILO_SITUACAO[s])}>{ROTULO_SITUACAO[s]}</span>
      {txt && <span className={cn('text-[11px] whitespace-nowrap', s === 'vencido' ? 'text-red-400' : s === 'em_risco' ? 'text-amber-400' : 'text-muted-foreground')}>{txt}</span>}
    </span>
  )
}

export function TipoNivel({ tipo, nivel, categoria }: { tipo?: string | null; nivel: string; categoria?: string | null }) {
  return (
    <span className="text-xs text-muted-foreground">
      {tipo ? ROTULO_TIPO[tipo] ?? tipo : ''}{tipo && nivel !== tipo ? ' · ' : ''}
      {nivel !== tipo && <span className={cn('font-medium', ESTILO_NIVEL[nivel])}>{ROTULO_NIVEL[nivel] ?? nivel}</span>}
      {categoria ? ` · ${categoria}` : ''}
    </span>
  )
}

export default function CartaoSla({ o }: { o: CamposSla & { sla_pausa_min?: number; agendado_pelo_cliente?: boolean } }) {
  const agora = useAgora()
  const s = situacaoSla(o, agora)
  if (s === 'sem_sla' || s === 'cancelada') return null
  const marco = (rotulo: string, prazo?: string | null, feito?: string | null, ok?: boolean | null) => {
    if (!prazo) return null
    const venceu = feito ? new Date(feito) > new Date(prazo) : agora > new Date(prazo).getTime()
    return (
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{rotulo}</span>
        <span className={cn('text-right', feito ? (ok === false || venceu ? 'text-red-400' : 'text-green-400') : venceu ? 'text-red-400' : 'text-foreground')}>
          até {dataHora(prazo)}{feito ? ` · feito ${dataHora(feito)}` : ''}
        </span>
      </div>
    )
  }
  return (
    <Card className="p-4 mb-4" data-testid="cartao-sla">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-foreground flex items-center gap-1.5"><Timer size={15} className="text-primary" /> SLA</p>
        <SeloSla o={o} comTexto />
      </div>
      <div className="space-y-1">
        {marco('Resposta (técnico designado)', o.prazo_resposta, o.respondido_em, o.sla_resposta_ok)}
        {marco('Atendimento (início)', o.prazo_atendimento, o.atendido_em, o.sla_atendimento_ok)}
        {marco('Solução (conclusão)', o.prazo_solucao, o.status === 'concluida' ? (o as any).completed_at : null, o.sla_solucao_ok)}
      </div>
      {(o.agendado_pelo_cliente || (o.sla_pausa_min ?? 0) > 0) && (
        <p className="text-[11px] text-muted-foreground mt-2">
          {o.agendado_pelo_cliente ? 'Prazo combinado com o cliente no agendamento. ' : ''}
          {(o.sla_pausa_min ?? 0) > 0 ? `Relógio pausado por ${o.sla_pausa_min} min úteis.` : ''}
        </p>
      )}
    </Card>
  )
}
