import { Plus, X } from 'lucide-react'
import { rotulosPeriodo, type ConfigAgendamento } from '@/lib/portalChamados'

// Até 3 opções de data e período, dentro da antecedência mínima e do horizonte que a empresa configurou
const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
export interface OpcaoData { data: string; periodo: string }

export default function OpcoesDatas({ opcoes, setOpcoes, config, avisos = {} }: {
  opcoes: OpcaoData[]; setOpcoes: (f: (l: OpcaoData[]) => OpcaoData[]) => void; config?: ConfigAgendamento | null; avisos?: Record<number, string | null>
}) {
  const rotulos = rotulosPeriodo(config)
  const min = config?.data_minima ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const fmt = (iso?: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '')
  return (
    <div data-testid="opcoes-datas">
      <div className="space-y-2">
        {opcoes.map((p, i) => (
          <div key={i}>
            <div className="flex gap-2">
              <input type="date" aria-label={`Data ${i + 1}`} min={min} max={config?.data_maxima} value={p.data} onChange={e => setOpcoes(l => l.map((x, k) => k === i ? { ...x, data: e.target.value } : x))} className={campo} data-data={i} />
              <select aria-label={`Período ${i + 1}`} value={p.periodo} onChange={e => setOpcoes(l => l.map((x, k) => k === i ? { ...x, periodo: e.target.value } : x))} className={campo + ' w-44'} data-periodo={i}>
                {Object.entries(rotulos).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
              {opcoes.length > 1 && <button type="button" aria-label="Remover data" onClick={() => setOpcoes(l => l.filter((_, k) => k !== i))} className="px-2 text-muted-foreground"><X size={16} /></button>}
            </div>
            {avisos[i] && <p className="text-xs text-amber-300 mt-1" data-aviso-data={i}>{avisos[i]} — o atendimento pode propor outra data.</p>}
          </div>
        ))}
      </div>
      {opcoes.length < 3 && <button type="button" onClick={() => setOpcoes(l => [...l, { data: '', periodo: 'qualquer' }])} className="mt-2 text-xs text-primary inline-flex items-center gap-1" data-testid="mais-uma-data"><Plus size={12} /> Adicionar outra opção</button>}
      {config && <p className="text-[11px] text-muted-foreground mt-1" data-testid="regra-datas">Datas a partir de {fmt(config.data_minima)} (antecedência mínima de {config.antecedencia_horas} horas) e até {fmt(config.data_maxima)}.</p>}
    </div>
  )
}
