import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Label, Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import {
  atalhos, mesmaRegra, partesData, resumoRegra, resumoRecorrencia, dataCurtaDia,
  type ChaveAtalho, type Recorrencia, type Regra, type Freq, type TerminoTipo,
} from '@/lib/recorrencia'
import { cn } from '@/lib/utils'
import { AlertTriangle, Loader2, Repeat } from 'lucide-react'

// Campo "Repetir" (desenho aprovado 2026-09-25): atalhos prontos a partir
// da data de início + "Personalizar..." em modal por cima (estilo Google
// Agenda/Outlook). Resumo em texto e próximas datas vêm do BANCO
// (previa_recorrencia) — a mesma regra que gera as ocorrências. Datas em
// fim de semana/feriado só são avisadas (não mudam).

interface Props {
  inicio: string
  valor: Recorrencia | null           // null = não se repete
  onChange: (v: Recorrencia | null) => void
  locationId?: string | null
}

interface Previa { data: string; dia_util: boolean; motivo: string | null }

const DIAS = [
  { v: 1, r: 'S', t: 'Segunda' }, { v: 2, r: 'T', t: 'Terça' }, { v: 3, r: 'Q', t: 'Quarta' }, { v: 4, r: 'Q', t: 'Quinta' },
  { v: 5, r: 'S', t: 'Sexta' }, { v: 6, r: 'S', t: 'Sábado' }, { v: 0, r: 'D', t: 'Domingo' },
]

function chaveDe(inicio: string, v: Recorrencia | null): ChaveAtalho {
  if (!v) return 'nao'
  if (v.termino_tipo !== 'nunca') return 'custom'
  return atalhos(inicio).find(a => a.regra && mesmaRegra(a.regra, v.regra))?.chave ?? 'custom'
}

export function usePreviaRecorrencia(inicio: string, valor: Recorrencia | null, locationId?: string | null, qtd = 5) {
  const [previa, setPrevia] = useState<Previa[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const chave = JSON.stringify([inicio, valor, locationId, qtd])
  useEffect(() => {
    if (!valor || !inicio) { setPrevia([]); setErro(''); return }
    let vivo = true
    setCarregando(true)
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('previa_recorrencia', {
        p_regra: valor.regra, p_inicio: inicio, p_location: locationId || null,
        p_termino_tipo: valor.termino_tipo, p_termino_qtd: valor.termino_qtd, p_termino_data: valor.termino_data, p_qtd: qtd,
      })
      if (!vivo) return
      if (error) { setErro(error.message); setPrevia([]) } else { setErro(''); setPrevia((data ?? []) as Previa[]) }
      setCarregando(false)
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps
  return { previa, carregando, erro }
}

export function PreviaDatas({ previa, carregando, erro }: { previa: Previa[]; carregando: boolean; erro: string }) {
  if (erro) return <p className="text-xs text-red-400">{erro}</p>
  if (carregando && !previa.length) return <Loader2 size={14} className="animate-spin text-muted-foreground" />
  const foraExpediente = previa.filter(p => !p.dia_util)
  return (
    <div data-testid="previa-recorrencia">
      <div className="flex flex-wrap gap-1.5">
        {previa.map(p => (
          <span key={p.data} title={p.motivo ?? ''}
            className={cn('text-[11px] px-1.5 py-0.5 rounded border',
              p.dia_util ? 'border-border text-foreground' : 'border-amber-500/40 bg-amber-500/10 text-amber-300')}>
            {dataCurtaDia(p.data)}
          </span>
        ))}
        {!previa.length && !carregando && <span className="text-xs text-muted-foreground">Nenhuma data neste período.</span>}
      </div>
      {foraExpediente.length > 0 && (
        <p className="text-[11px] text-amber-300 mt-1.5 flex items-start gap-1" data-testid="previa-aviso">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          Algumas datas caem fora do expediente ou do funcionamento da unidade ({[...new Set(foraExpediente.flatMap(p => (p.motivo ?? '').split(' · ')))].join(', ')}). Elas são mantidas — ajuste a regra se não quiser.
        </p>
      )}
    </div>
  )
}

export default function RecorrenciaCampo({ inicio, valor, onChange, locationId }: Props) {
  const opcoes = useMemo(() => atalhos(inicio), [inicio])
  const [chave, setChave] = useState<ChaveAtalho>(() => chaveDe(inicio, valor))
  const [personalizando, setPersonalizando] = useState(false)
  const prev = usePreviaRecorrencia(inicio, valor, locationId)

  // mudou a data de início: atalho escolhido acompanha (ex.: "Toda segunda" → "Toda terça")
  useEffect(() => {
    if (chave === 'nao' || chave === 'custom') return
    const a = opcoes.find(o => o.chave === chave)
    if (a?.regra) onChange({ regra: a.regra, termino_tipo: 'nunca', termino_qtd: null, termino_data: null })
    else { setChave('nao'); onChange(null) }
  }, [inicio]) // eslint-disable-line react-hooks/exhaustive-deps

  function escolher(c: string) {
    if (c === '__personalizar' || c === 'custom') { setPersonalizando(true); return }
    const a = opcoes.find(o => o.chave === c)
    setChave(c as ChaveAtalho)
    onChange(a?.regra ? { regra: a.regra, termino_tipo: 'nunca', termino_qtd: null, termino_data: null } : null)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="repetir">Repetir</Label>
      <select id="repetir" value={chave} onChange={e => escolher(e.target.value)}
        className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground">
        {opcoes.map(o => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}
        {chave === 'custom' && valor && <option value="custom">{resumoRecorrencia(valor)}</option>}
        <option value="__personalizar">Personalizar...</option>
      </select>
      {chave === 'custom' && valor && (
        <button type="button" onClick={() => setPersonalizando(true)} className="text-xs text-primary hover:underline">Alterar repetição personalizada</button>
      )}
      {valor && (
        <div className="rounded-md border border-border px-3 py-2 space-y-1.5">
          <p className="text-xs text-foreground flex items-center gap-1.5" data-testid="resumo-recorrencia"><Repeat size={12} className="text-primary" /> {resumoRecorrencia(valor)}, a partir de {dataCurtaDia(inicio)}</p>
          <p className="text-[11px] text-muted-foreground">Próximas datas:</p>
          <PreviaDatas {...prev} />
        </div>
      )}
      {personalizando && (
        <Personalizar inicio={inicio} inicial={valor} locationId={locationId}
          onCancelar={() => setPersonalizando(false)}
          onConcluir={v => { setPersonalizando(false); setChave(chaveDe(inicio, v)); onChange(v) }} />
      )}
    </div>
  )
}

// ---------- modal "Personalizar..." ----------
function Personalizar({ inicio, inicial, locationId, onCancelar, onConcluir }: {
  inicio: string; inicial: Recorrencia | null; locationId?: string | null
  onCancelar: () => void; onConcluir: (v: Recorrencia) => void
}) {
  const p = partesData(inicio)
  const base: Regra = inicial?.regra ?? { freq: 'semanal', intervalo: 1, dias_semana: [p.dow] }
  const [freq, setFreq] = useState<Freq>(base.freq)
  const [intervalo, setIntervalo] = useState(String(base.intervalo || 1))
  const [diasUteis, setDiasUteis] = useState(!!base.dias_uteis)
  const [dias, setDias] = useState<number[]>(base.dias_semana ?? [p.dow])
  const [modoMes, setModoMes] = useState<'dia' | 'ordinal' | 'ultimo_dia'>(
    base.freq === 'mensal' ? (base.modo === 'ordinal' ? 'ordinal' : base.dia_mes === -1 ? 'ultimo_dia' : 'dia') : 'dia')
  const [ordinal, setOrdinal] = useState<number>(base.ordinal ?? (p.ordinal <= 4 ? p.ordinal : -1))
  const [terminoTipo, setTerminoTipo] = useState<TerminoTipo>(inicial?.termino_tipo ?? 'nunca')
  const [terminoQtd, setTerminoQtd] = useState(String(inicial?.termino_qtd ?? 10))
  const [terminoData, setTerminoData] = useState(inicial?.termino_data ?? '')
  const [erro, setErro] = useState('')

  const regra: Regra = useMemo(() => {
    const i = Math.max(1, Math.min(99, parseInt(intervalo) || 1))
    if (freq === 'diaria') return diasUteis ? { freq, intervalo: 1, dias_uteis: true } : { freq, intervalo: i }
    if (freq === 'semanal') return { freq, intervalo: i, dias_semana: dias }
    if (freq === 'mensal') {
      if (modoMes === 'ordinal') return { freq, intervalo: i, modo: 'ordinal', ordinal, dia_semana: p.dow }
      return { freq, intervalo: i, modo: 'dia', dia_mes: modoMes === 'ultimo_dia' ? -1 : p.d }
    }
    return { freq, intervalo: i, mes: p.m, dia: p.d }
  }, [freq, intervalo, diasUteis, dias, modoMes, ordinal, p.dow, p.d, p.m])

  const rec: Recorrencia = {
    regra, termino_tipo: terminoTipo,
    termino_qtd: terminoTipo === 'apos' ? Math.max(1, Math.min(999, parseInt(terminoQtd) || 1)) : null,
    termino_data: terminoTipo === 'em' ? (terminoData || null) : null,
  }
  const valido = !(freq === 'semanal' && dias.length === 0) && !(terminoTipo === 'em' && (!terminoData || terminoData < inicio))
  const prev = usePreviaRecorrencia(inicio, valido ? rec : null, locationId)

  function concluir() {
    if (freq === 'semanal' && dias.length === 0) { setErro('Escolha pelo menos um dia da semana.'); return }
    if (terminoTipo === 'em' && (!terminoData || terminoData < inicio)) { setErro('A data de término precisa ser depois do início.'); return }
    onConcluir(rec)
  }

  const unidades: Record<Freq, [string, string]> = { diaria: ['dia', 'dias'], semanal: ['semana', 'semanas'], mensal: ['mês', 'meses'], anual: ['ano', 'anos'] }
  const n = parseInt(intervalo) || 1

  return (
    <Modal open onOpenChange={o => { if (!o) onCancelar() }} title="Repetição personalizada" className="max-w-md" fecharAoClicarFora={false}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-foreground">Repetir a cada</span>
          <Input aria-label="Intervalo" value={diasUteis && freq === 'diaria' ? '1' : intervalo} disabled={diasUteis && freq === 'diaria'}
            onChange={e => setIntervalo(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className="w-16 text-center" />
          <select aria-label="Frequência" value={freq} onChange={e => setFreq(e.target.value as Freq)}
            className="px-2 py-2.5 rounded-md bg-input border border-border text-sm text-foreground">
            {(Object.keys(unidades) as Freq[]).map(f => <option key={f} value={f}>{n === 1 ? unidades[f][0] : unidades[f][1]}</option>)}
          </select>
        </div>

        {freq === 'diaria' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={diasUteis} onChange={e => setDiasUteis(e.target.checked)} />
            <span className="text-sm text-foreground">Só em dias úteis <span className="text-xs text-muted-foreground">(horário de atendimento padrão e feriados — Calendários)</span></span>
          </label>
        )}

        {freq === 'semanal' && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Em</p>
            <div className="flex gap-1.5">
              {DIAS.map(d => (
                <button key={d.v} type="button" title={d.t} aria-label={d.t} aria-pressed={dias.includes(d.v)}
                  onClick={() => setDias(x => x.includes(d.v) ? x.filter(y => y !== d.v) : [...x, d.v])}
                  className={cn('w-9 h-9 rounded-full text-xs font-medium border transition',
                    dias.includes(d.v) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {d.r}
                </button>
              ))}
            </div>
          </div>
        )}

        {freq === 'mensal' && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
              <input type="radio" name="modo-mes" checked={modoMes === 'dia'} onChange={() => setModoMes('dia')} />
              No dia {p.d}{p.d >= 29 && <span className="text-xs text-muted-foreground">(nos meses mais curtos, no último dia)</span>}
            </label>
            {p.ordinal <= 4 && (
              <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                <input type="radio" name="modo-mes" checked={modoMes === 'ordinal' && ordinal !== -1} onChange={() => { setModoMes('ordinal'); setOrdinal(p.ordinal) }} />
                {resumoRegra({ freq: 'mensal', intervalo: 1, modo: 'ordinal', ordinal: p.ordinal, dia_semana: p.dow }).replace('Todo mês, ', '').replace(/^n/, 'N')}
              </label>
            )}
            <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
              <input type="radio" name="modo-mes" checked={modoMes === 'ordinal' && ordinal === -1} onChange={() => { setModoMes('ordinal'); setOrdinal(-1) }} />
              {resumoRegra({ freq: 'mensal', intervalo: 1, modo: 'ordinal', ordinal: -1, dia_semana: p.dow }).replace('Todo mês, ', '').replace(/^n/, 'N')}
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
              <input type="radio" name="modo-mes" checked={modoMes === 'ultimo_dia'} onChange={() => setModoMes('ultimo_dia')} />
              No último dia do mês
            </label>
          </div>
        )}

        {freq === 'anual' && <p className="text-sm text-foreground">{resumoRegra(regra)}</p>}

        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Término</p>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
            <input type="radio" name="termino" checked={terminoTipo === 'nunca'} onChange={() => setTerminoTipo('nunca')} /> Nunca
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
            <input type="radio" name="termino" checked={terminoTipo === 'apos'} onChange={() => setTerminoTipo('apos')} /> Após
            <Input aria-label="Quantidade de ocorrências" value={terminoQtd} onChange={e => { setTerminoQtd(e.target.value.replace(/\D/g, '').slice(0, 3)); setTerminoTipo('apos') }}
              inputMode="numeric" className="w-16 text-center py-1.5" /> ocorrências
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
            <input type="radio" name="termino" checked={terminoTipo === 'em'} onChange={() => setTerminoTipo('em')} /> Em
            <Input type="date" aria-label="Data de término" value={terminoData} min={inicio} onChange={e => { setTerminoData(e.target.value); setTerminoTipo('em') }} className="w-40 py-1.5" />
          </label>
        </div>

        <div className="rounded-md bg-secondary/40 px-3 py-2 space-y-1.5">
          <p className="text-xs text-foreground" data-testid="resumo-personalizado">{resumoRecorrencia(rec)}</p>
          {valido && <PreviaDatas {...prev} />}
        </div>

        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button type="button" variant="cta" onClick={concluir}>Concluído</Button>
        </div>
      </div>
    </Modal>
  )
}

// Aviso de uma data avulsa (checklist que não se repete, "Remarcar só este"):
// mesmo critério da prévia (aviso_da_data no banco) — informa, não bloqueia
export function AvisoData({ data, locationId, testId }: { data: string; locationId?: string | null; testId?: string }) {
  const [aviso, setAviso] = useState<string | null>(null)
  useEffect(() => {
    if (!data) { setAviso(null); return }
    let vivo = true
    const t = setTimeout(async () => {
      const { data: a } = await supabase.rpc('aviso_da_data', { p_data: data, p_location: locationId || null })
      if (vivo) setAviso((a as string | null) ?? null)
    }, 200)
    return () => { vivo = false; clearTimeout(t) }
  }, [data, locationId])
  if (!aviso) return null
  return (
    <p className="text-[11px] text-amber-300 mt-1 flex items-start gap-1" data-testid={testId ?? 'aviso-data'}>
      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {dataCurtaDia(data)}: {aviso}. A data é mantida — altere se não quiser.
    </p>
  )
}
