import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { useLocations } from '@/hooks/useLocations'
import { useHorariosAtendimento } from '@/components/calendario/HorariosAtendimento'
import { ROTULO_EFEITO, type SituacaoDia } from '@/lib/calendario'

const ROTULO_ABRANGENCIA = { nacional: 'Nacional', estadual: 'Estadual', municipal: 'Municipal', empresa: 'Da empresa' } as const
import { CalendarCheck, CalendarX, Loader2, Search } from 'lucide-react'

// "Conferir uma data": mostra o que as funções de tempo do banco dizem de
// um dia (a mesma resposta que recorrência e SLA vão usar) — para o gestor
// validar a configuração sem esperar o dia chegar.

function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ConferirData() {
  const { itens: horarios } = useHorariosAtendimento()
  const { locations } = useLocations()
  const [horario, setHorario] = useState('')
  const [unidade, setUnidade] = useState('')
  const [data, setData] = useState(hoje())
  const [res, setRes] = useState<SituacaoDia | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!horario && horarios.length) setHorario(horarios.find(h => h.padrao)?.id ?? horarios[0].id)
  }, [horarios, horario])

  const opcoesUnidade = useMemo(() => [
    { value: '', label: 'Sem unidade (cidade da sede)' },
    ...locations.filter(l => l.active).map(l => ({
      value: l.id,
      label: `${l.name} — ${l.client?.name ?? ''}${l.cidade_ibge ? '' : ' (sem cidade IBGE)'}`,
    })),
  ], [locations])

  useEffect(() => {
    if (!horario || !data) return
    let vivo = true
    setCarregando(true)
    setErro('')
    const cidade = locations.find(l => l.id === unidade)?.cidade_ibge ?? null
    supabase.rpc('situacao_do_dia', { p_horario: horario, p_data: data, p_cidade_ibge: cidade })
      .then(({ data: d, error }) => {
        if (!vivo) return
        if (error) { setErro(error.message); setRes(null) } else setRes(d as SituacaoDia)
        setCarregando(false)
      })
    return () => { vivo = false }
  }, [horario, unidade, data, locations])

  return (
    <Card className="p-4 space-y-3" data-testid="conferir-data">
      <div className="flex items-center gap-2">
        <Search size={15} className="text-primary" />
        <p className="text-sm font-medium text-foreground">Conferir uma data</p>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">Veja se um dia tem expediente — a mesma resposta que a recorrência e o SLA vão usar.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="conf-horario">Horário</Label>
          <Combobox id="conf-horario" options={horarios.filter(h => h.ativo).map(h => ({ value: h.id, label: h.nome + (h.padrao ? ' (padrão)' : '') }))}
            value={horario} onChange={setHorario} placeholder="Horário" searchPlaceholder="Buscar..." />
        </div>
        <div>
          <Label htmlFor="conf-unidade">Unidade</Label>
          <Combobox id="conf-unidade" options={opcoesUnidade} value={unidade} onChange={setUnidade}
            placeholder="Sem unidade (cidade da sede)" searchPlaceholder="Buscar unidade..." emptyText="Nenhuma unidade." />
        </div>
        <div>
          <Label htmlFor="conf-data">Data</Label>
          <Input id="conf-data" type="date" value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>
      {carregando ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : erro ? (
        <p className="text-sm text-red-400">{erro}</p>
      ) : res && (
        <div data-testid="conferir-resultado"
          className={'rounded-md border px-3 py-2.5 ' + (res.dia_util ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5')}>
          <p className={'text-sm font-medium flex items-center gap-2 ' + (res.dia_util ? 'text-green-400' : 'text-amber-300')}>
            {res.dia_util ? <CalendarCheck size={15} /> : <CalendarX size={15} />}
            {res.dia_util ? 'Dia útil — expediente ' + res.periodos.map(([a, b]) => `${a}–${b}`).join(' e ') : 'Sem expediente'}
          </p>
          {res.feriados.map((f, i) => (
            <p key={i} className="text-xs text-muted-foreground mt-1">
              {f.nome} · {ROTULO_ABRANGENCIA[f.abrangencia]} → {ROTULO_EFEITO[f.efeito]}
            </p>
          ))}
          {!res.considera_feriados && res.feriados.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">Este horário ignora feriados.</p>
          )}
        </div>
      )}
    </Card>
  )
}
