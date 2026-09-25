// Períodos dos filtros de lista (checklists avulsos, OS e, depois, F7).
// Datas puras (AAAA-MM-DD) no fuso da empresa — "hoje" vem de fora.
import { somarDias, partesData } from '@/lib/recorrencia'

export type ChavePeriodo = '' | 'hoje' | 'semana' | 'mes' | 'mes_passado' | 'personalizado'

export const PERIODOS: { value: ChavePeriodo; label: string }[] = [
  { value: '', label: 'Qualquer data' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mês' },
  { value: 'mes_passado', label: 'Mês passado' },
  { value: 'personalizado', label: 'Personalizado' },
]

function iso(a: number, m: number, d: number): string {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// { de, ate } do período; personalizado usa as datas informadas
export function intervaloDoPeriodo(chave: ChavePeriodo, hoje: string, de?: string, ate?: string): { de: string | null; ate: string | null } {
  const p = partesData(hoje)
  switch (chave) {
    case 'hoje': return { de: hoje, ate: hoje }
    case 'semana': {                                   // segunda a domingo
      const seg = somarDias(hoje, -((p.dow + 6) % 7))
      return { de: seg, ate: somarDias(seg, 6) }
    }
    case 'mes': return { de: iso(p.a, p.m, 1), ate: iso(p.a, p.m, new Date(Date.UTC(p.a, p.m, 0)).getUTCDate()) }
    case 'mes_passado': {
      const a = p.m === 1 ? p.a - 1 : p.a, m = p.m === 1 ? 12 : p.m - 1
      return { de: iso(a, m, 1), ate: iso(a, m, new Date(Date.UTC(a, m, 0)).getUTCDate()) }
    }
    case 'personalizado': return { de: de || null, ate: ate || null }
    default: return { de: null, ate: null }
  }
}
