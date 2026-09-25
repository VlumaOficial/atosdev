import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { SecaoRecolhivel } from '@/components/ui/secao-recolhivel'
import { FUSOS } from '@/lib/calendario'
import { Globe } from 'lucide-react'

// Fuso horário da empresa (migration 035): todo cálculo de "que horas são
// para esta empresa" — dia útil, SLA, horário das mensagens — passa por ele.

export default function FusoHorarioCard() {
  const { user, tenant, refreshTenant } = useAuth()
  const atual = tenant?.fuso_horario ?? 'America/Sao_Paulo'
  const [valor, setValor] = useState(atual)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  async function salvar() {
    setSalvando(true)
    setMsg(null)
    const { error } = await supabase.rpc('definir_fuso_horario', { p_fuso: valor })
    setSalvando(false)
    if (error) { setMsg({ ok: false, texto: error.message }); return }
    await refreshTenant()
    setMsg({ ok: true, texto: 'Fuso horário salvo.' })
  }

  const rotulo = FUSOS.find(f => f.value === atual)?.label ?? atual
  return (
    <SecaoRecolhivel id="fuso" icone={<Globe size={16} className="text-primary" />}
      titulo="Fuso horário da empresa"
      descricao="Usado para o dia útil, a recorrência, o SLA e o horário das mensagens."
      resumo={rotulo.split(' (')[0]}>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Fuso horário" value={valor} onChange={e => setValor(e.target.value)} disabled={user?.role !== 'admin'}
          className="px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground">
          {FUSOS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <Button variant="cta" size="sm" loading={salvando} disabled={valor === atual} onClick={salvar}>Salvar</Button>
        {msg && <p className={'text-xs ' + (msg.ok ? 'text-green-400' : 'text-red-400')}>{msg.texto}</p>}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">Feriados e horários de atendimento ficam em <b>Calendários</b>, no menu.</p>
    </SecaoRecolhivel>
  )
}
