import { CheckCircle2, Clock, Calendar, Inbox, XCircle } from 'lucide-react'
import { STATUS_CLIENTE, type StatusCliente } from '@/lib/portalChamados'
import { cn } from '@/lib/utils'

const ICONE = { recebido: Inbox, agendado: Calendar, em_atendimento: Clock, resolvido: CheckCircle2, cancelado: XCircle } as const

// Situação em texto + ícone + cor (nunca só cor)
export default function StatusChamado({ status }: { status: StatusCliente }) {
  const s = STATUS_CLIENTE[status] ?? STATUS_CLIENTE.recebido
  const I = ICONE[status] ?? Inbox
  return <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border whitespace-nowrap', s.cor)} data-status={status}><I size={12} /> {s.rotulo}</span>
}
