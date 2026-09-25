import { Plus, X, Copy } from 'lucide-react'
import { DIAS, MODELOS_SEMANA, type Intervalo, type Semana } from '@/lib/calendario'
import { cn } from '@/lib/utils'

// Grade semanal de intervalos (horário de atendimento e horário de
// funcionamento da Unidade). Campo de texto HH:MM em vez de <input
// type="time"> porque o fim "24:00" (dia inteiro) é válido e o seletor
// nativo não aceita.

interface Props {
  valor: Semana
  onChange: (s: Semana) => void
  mostrarModelos?: boolean
}

// "0800" → "08:00", "8" → "8"
function mascarar(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d
}

// próximo intervalo sugerido: depois do almoço (13–18) ou até meia-noite
function sugerirProximo(fimAnterior: string): Intervalo {
  if (fimAnterior <= '12:00') return ['13:00', '18:00']
  const h = Math.min(Number(fimAnterior.slice(0, 2)) + 1, 23)
  return [String(h).padStart(2, '0') + ':00', '24:00']
}

export default function SemanaEditor({ valor, onChange, mostrarModelos = true }: Props) {
  function setDia(k: keyof Semana, lista: Intervalo[]) {
    const s: Semana = { ...valor }
    if (lista.length) s[k] = lista
    else delete s[k]
    onChange(s)
  }

  function copiarSegunda() {
    const seg = valor['1'] ?? []
    const s: Semana = { ...valor }
    ;(['2', '3', '4', '5'] as const).forEach(k => {
      if (seg.length) s[k] = seg.map(i => [...i] as Intervalo)
      else delete s[k]
    })
    onChange(s)
  }

  return (
    <div className="space-y-3">
      {mostrarModelos && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Começar de um modelo</p>
          <div className="flex flex-wrap gap-1.5">
            {MODELOS_SEMANA.map(m => (
              <button key={m.nome} type="button" onClick={() => onChange(JSON.parse(JSON.stringify(m.semana)))}
                title={m.descricao}
                className="px-2.5 py-1 rounded-full border border-border text-xs text-foreground hover:bg-secondary transition">
                {m.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md border border-border divide-y divide-border">
        {DIAS.map(d => {
          const lista = valor[d.k] ?? []
          const aberto = lista.length > 0
          return (
            <div key={d.k} className="flex items-start gap-3 px-3 py-2" data-dia={d.k}>
              <label className="flex items-center gap-2 w-24 flex-shrink-0 pt-1.5 cursor-pointer">
                <input type="checkbox" checked={aberto} aria-label={d.longo}
                  onChange={e => setDia(d.k, e.target.checked ? [['08:00', '18:00']] : [])}
                  className="accent-[hsl(var(--primary))]" />
                <span className={cn('text-sm', aberto ? 'text-foreground' : 'text-muted-foreground')}>{d.longo}</span>
              </label>
              <div className="flex-1 min-w-0 space-y-1.5">
                {!aberto && <p className="text-xs text-muted-foreground pt-2">Fechado</p>}
                {lista.map(([ini, fim], i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={ini} inputMode="numeric" placeholder="08:00" aria-label={`${d.longo} início ${i + 1}`}
                      onChange={e => setDia(d.k, lista.map((x, j) => j === i ? [mascarar(e.target.value), x[1]] as Intervalo : x))}
                      className="w-16 px-2 py-1.5 rounded-md bg-input border border-border text-sm text-foreground text-center" />
                    <span className="text-xs text-muted-foreground">às</span>
                    <input value={fim} inputMode="numeric" placeholder="18:00" aria-label={`${d.longo} fim ${i + 1}`}
                      onChange={e => setDia(d.k, lista.map((x, j) => j === i ? [x[0], mascarar(e.target.value)] as Intervalo : x))}
                      className="w-16 px-2 py-1.5 rounded-md bg-input border border-border text-sm text-foreground text-center" />
                    <button type="button" onClick={() => setDia(d.k, lista.filter((_, j) => j !== i))} title="Remover intervalo"
                      className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                      <X size={14} />
                    </button>
                    {i === lista.length - 1 && fim !== '24:00' && (
                      <button type="button" title="Adicionar intervalo (ex.: após o almoço)"
                        onClick={() => setDia(d.k, [...lista, sugerirProximo(fim)])}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary">
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {aberto && !(lista.length === 1 && lista[0][0] === '00:00' && lista[0][1] === '24:00') && (
                <button type="button" onClick={() => setDia(d.k, [['00:00', '24:00']])}
                  className="text-[11px] text-muted-foreground hover:text-foreground pt-2 flex-shrink-0">24h</button>
              )}
            </div>
          )
        })}
      </div>

      <button type="button" onClick={copiarSegunda}
        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
        <Copy size={12} /> Copiar a segunda-feira para terça a sexta
      </button>
      <p className="text-[11px] text-muted-foreground">Use 24:00 para "até meia-noite". Para intervalo de almoço, adicione um segundo horário no mesmo dia.</p>
    </div>
  )
}
