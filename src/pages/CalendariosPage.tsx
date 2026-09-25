import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/ui/page-header'
import Feriados from '@/components/calendario/Feriados'
import HorariosAtendimento from '@/components/calendario/HorariosAtendimento'
import ConferirData from '@/components/calendario/ConferirData'
import { cn } from '@/lib/utils'

// Módulo "Calendários" (nome aprovado em 2026-09-25): base única de tempo
// de trabalho. Hoje: feriados + horários de atendimento. Escalas da equipe
// entram junto com a notificação diária (etapa futura).

type Aba = 'feriados' | 'horarios'

function lerAba(): Aba {
  try { return localStorage.getItem('atos_calendarios_aba') === 'horarios' ? 'horarios' : 'feriados' } catch { return 'feriados' }
}

export default function CalendariosPage() {
  const { user, tenant } = useAuth()
  const [aba, setAbaEstado] = useState<Aba>(lerAba)
  const plataforma = user?.role === 'super_admin'
  const podeEditar = user?.role === 'admin' || user?.role === 'gestor'

  function setAba(a: Aba) {
    setAbaEstado(a)
    try { localStorage.setItem('atos_calendarios_aba', a) } catch { /* sem storage */ }
  }

  if (plataforma || !tenant) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Calendários da plataforma" description="Feriados nacionais (e estaduais/municipais) que valem para todas as empresas do ATOS" />
        <Feriados />
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Calendários" description="Feriados e horários de atendimento da empresa — base do dia útil, da recorrência e do SLA" />
      <div className="flex gap-1 border-b border-border mb-4" role="tablist">
        {([['feriados', 'Feriados'], ['horarios', 'Horários de atendimento']] as const).map(([k, r]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={cn('px-3 py-2 text-sm -mb-px border-b-2 transition',
              aba === k ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {r}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {aba === 'feriados' ? <Feriados /> : <HorariosAtendimento podeEditar={podeEditar} />}
        <ConferirData />
      </div>
    </div>
  )
}
