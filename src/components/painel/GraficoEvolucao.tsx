import { useEffect, useRef, useState } from 'react'

// Evolução do período (F7): abertas × concluídas (barras) e, logo abaixo,
// % de SLA cumprido (linha) — DOIS gráficos com o mesmo eixo de datas, em
// vez de um gráfico com dois eixos (escalas diferentes confundem a leitura).
// Paleta validada (dataviz, modo escuro, fundo do cartão #0f1524):
// série 1 azul #3987e5, série 2 laranja #d95926 — todas as checagens PASS.

export interface Balde { ini: string; fim: string; abertas: number; concluidas: number; sla_total: number; sla_ok: number }

const AZUL = '#3987e5'
const LARANJA = '#d95926'
const TINTA2 = 'hsl(215 20% 65%)'      // texto secundário
const GRADE = 'hsl(222 30% 18%)'       // grade recessiva
const FUNDO = 'hsl(222 40% 10%)'       // fundo do cartão (anel dos marcadores)

function dm(iso: string) { const [, m, d] = iso.split('-'); return `${d}/${m}` }
function rotulo(b: Balde) { return b.ini === b.fim ? dm(b.ini) : `${dm(b.ini)}–${dm(b.fim)}` }
function topoBonito(v: number) { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p) * p }
// barra com cantos de 4px só no topo (ancorada na base)
function barra(x: number, y: number, w: number, h: number) {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

export default function GraficoEvolucao({ dados, meta, semanal }: { dados: Balde[]; meta: number; semanal: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [larg, setLarg] = useState(300)   // começa estreito: o contêiner define a largura real
  const [foco, setFoco] = useState<number | null>(null)
  const [tabela, setTabela] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(e => setLarg(Math.max(280, e[0].contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  const ME = 34, MD = 8, H1 = 150, H2 = 90, BASE = 40   // BASE: datas do gráfico 1 + título do gráfico 2 sem colidir
  const n = Math.max(1, dados.length)
  const area = larg - ME - MD
  const passo = area / n
  const maxV = topoBonito(Math.max(1, ...dados.map(d => Math.max(d.abertas, d.concluidas))))
  const y1 = (v: number) => 8 + (H1 - 8) * (1 - v / maxV)
  const y2 = (pct: number) => 6 + (H2 - 12) * (1 - pct / 100)
  const larguraBarra = Math.max(2, Math.min(18, (passo - 6) / 2))
  const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(area / 48))))   // rótulos do eixo x sem colisão
  const pontos = dados.map((d, i) => d.sla_total > 0 ? { i, pct: Math.round((d.sla_ok / d.sla_total) * 100) } : null).filter(Boolean) as { i: number; pct: number }[]
  const cx = (i: number) => ME + passo * i + passo / 2
  const f = foco !== null ? dados[foco] : null

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: AZUL }} /> Abertas</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: LARANJA }} /> Concluídas</span>
        <span className="ml-auto">{semanal ? 'Por semana' : 'Por dia'}</span>
      </div>
      <div ref={ref} className="relative w-full overflow-hidden" onMouseLeave={() => setFoco(null)}>
        <svg width={larg} height={H1 + BASE + H2 + 10} role="img" aria-label="Evolução: OS abertas e concluídas, e percentual de SLA cumprido">
          {/* grade e eixo y do gráfico 1 */}
          {[0, 0.5, 1].map(t => (
            <g key={t}>
              <line x1={ME} x2={larg - MD} y1={y1(maxV * t)} y2={y1(maxV * t)} stroke={GRADE} strokeWidth={1} />
              <text x={ME - 6} y={y1(maxV * t) + 3} textAnchor="end" fontSize={10} fill={TINTA2}>{Math.round(maxV * t)}</text>
            </g>
          ))}
          {dados.map((d, i) => {
            const x0 = cx(i) - larguraBarra - 1
            return (
              <g key={d.ini} opacity={foco === null || foco === i ? 1 : 0.45}>
                <path d={barra(x0, y1(d.abertas), larguraBarra, H1 - y1(d.abertas))} fill={AZUL} />
                <path d={barra(x0 + larguraBarra + 2, y1(d.concluidas), larguraBarra, H1 - y1(d.concluidas))} fill={LARANJA} />
              </g>
            )
          })}
          {/* rótulos de data */}
          {dados.map((d, i) => i % cada === 0 && (
            <text key={d.ini} x={cx(i)} y={H1 + 14} textAnchor="middle" fontSize={10} fill={TINTA2}>{dm(d.ini)}</text>
          ))}
          {/* gráfico 2: % SLA (mesmo eixo de datas) */}
          <g transform={`translate(0, ${H1 + BASE})`}>
            <text x={ME} y={-8} fontSize={11} fill={TINTA2}>% SLA cumprido (OS concluídas com SLA)</text>
            {[0, 100].map(t => (
              <g key={t}>
                <line x1={ME} x2={larg - MD} y1={y2(t)} y2={y2(t)} stroke={GRADE} strokeWidth={1} />
                <text x={ME - 6} y={y2(t) + 3} textAnchor="end" fontSize={10} fill={TINTA2}>{t}%</text>
              </g>
            ))}
            <line x1={ME} x2={larg - MD} y1={y2(meta)} y2={y2(meta)} stroke={TINTA2} strokeWidth={1} strokeDasharray="4 4" />
            <text x={larg - MD} y={y2(meta) + 12} textAnchor="end" fontSize={10} fill={TINTA2}>meta {meta}%</text>
            {pontos.length > 1 && (
              <polyline fill="none" stroke={AZUL} strokeWidth={2} strokeLinejoin="round"
                points={pontos.map(p => `${cx(p.i)},${y2(p.pct)}`).join(' ')} />
            )}
            {pontos.map(p => <circle key={p.i} cx={cx(p.i)} cy={y2(p.pct)} r={4} fill={AZUL} stroke={FUNDO} strokeWidth={2} />)}
            {pontos.length === 0 && <text x={ME + area / 2} y={H2 / 2} textAnchor="middle" fontSize={11} fill={TINTA2}>Sem OS concluídas com SLA no período</text>}
          </g>
          {/* mira e áreas de foco (maiores que as marcas) */}
          {foco !== null && <line x1={cx(foco)} x2={cx(foco)} y1={4} y2={H1 + BASE + H2} stroke={TINTA2} strokeWidth={1} opacity={0.5} />}
          {dados.map((d, i) => (
            <rect key={d.ini} x={ME + passo * i} y={0} width={passo} height={H1 + BASE + H2 + 10} fill="transparent"
              onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)} />
          ))}
        </svg>
        {f && foco !== null && (
          <div className="absolute z-10 pointer-events-none rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(0, cx(foco) + 10), larg - 170), top: 8, width: 160 }} data-testid="tooltip-evolucao">
            <p className="text-foreground font-medium mb-1">{rotulo(f)}</p>
            <p className="text-muted-foreground flex justify-between"><span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: AZUL }} />Abertas</span><span className="text-foreground">{f.abertas}</span></p>
            <p className="text-muted-foreground flex justify-between"><span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: LARANJA }} />Concluídas</span><span className="text-foreground">{f.concluidas}</span></p>
            <p className="text-muted-foreground flex justify-between"><span>% SLA</span><span className="text-foreground">{f.sla_total ? `${Math.round((f.sla_ok / f.sla_total) * 100)}% (${f.sla_ok}/${f.sla_total})` : '—'}</span></p>
          </div>
        )}
      </div>
      <button type="button" onClick={() => setTabela(t => !t)} className="text-[11px] text-primary hover:underline mt-1">{tabela ? 'Ocultar tabela' : 'Ver em tabela'}</button>
      {tabela && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs" data-testid="tabela-evolucao">
            <thead><tr className="text-muted-foreground border-b border-border"><th className="text-left p-1.5 font-medium">{semanal ? 'Semana' : 'Dia'}</th><th className="text-right p-1.5 font-medium">Abertas</th><th className="text-right p-1.5 font-medium">Concluídas</th><th className="text-right p-1.5 font-medium">% SLA</th></tr></thead>
            <tbody>{dados.map(d => (
              <tr key={d.ini} className="border-b border-border/50"><td className="p-1.5 text-foreground">{rotulo(d)}</td><td className="p-1.5 text-right">{d.abertas}</td><td className="p-1.5 text-right">{d.concluidas}</td>
                <td className="p-1.5 text-right">{d.sla_total ? `${Math.round((d.sla_ok / d.sla_total) * 100)}%` : '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
