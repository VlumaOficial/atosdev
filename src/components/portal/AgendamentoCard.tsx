import { useEffect, useState } from 'react'
import { CalendarClock, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { SecaoRecolhivel } from '@/components/ui/secao-recolhivel'

// Configurações › Agendamento de visitas e atendimentos (E5b): o calendário que o cliente vê, as janelas, o que ele pode
// fazer (reagendar, cancelar) e os lembretes automáticos. Só o administrador.
const PADRAO = {
  antecedencia_horas: 48, horizonte_dias: 60,
  janelas: { manha: { nome: 'Manhã', inicio: '08:00', fim: '12:00' }, tarde: { nome: 'Tarde', inicio: '13:00', fim: '18:00' } },
  cliente_reagenda: true, reagendar_antecedencia_horas: 24, max_reagendamentos_cliente: 2, reagendar_motivo_obrigatorio: false,
  cliente_cancela: true, cancelar_antecedencia_horas: 24, lembretes: [{ antes_horas: 48 }, { antes_horas: 24 }],
}
const campo = 'px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
type Cfg = typeof PADRAO

export default function AgendamentoCard() {
  const { tenant, refreshTenant } = useAuth()
  const [c, setC] = useState<Cfg>(PADRAO)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  useEffect(() => {
    const t: any = tenant?.agendamento_config ?? {}
    setC({ ...PADRAO, ...t, janelas: { manha: { ...PADRAO.janelas.manha, ...(t.janelas?.manha ?? {}) }, tarde: { ...PADRAO.janelas.tarde, ...(t.janelas?.tarde ?? {}) } }, lembretes: t.lembretes ?? PADRAO.lembretes })
  }, [tenant?.agendamento_config])
  const num = (v: string) => (v === '' ? 0 : Number(v))
  async function salvar() {
    setMsg(null); setSalvando(true)
    const { error } = await supabase.rpc('salvar_agendamento_config', { p: c })
    setSalvando(false)
    if (error) { setMsg({ ok: false, texto: error.message }); return }
    await refreshTenant(); setMsg({ ok: true, texto: 'Salvo.' })
  }
  if (!tenant?.portal_habilitado) return null
  const janela = (k: 'manha' | 'tarde', rotulo: string) => (
    <div className="grid grid-cols-[90px_1fr_90px_90px] gap-2 items-center" data-janela={k}>
      <span className="text-sm text-foreground">{rotulo}</span>
      <input aria-label={`Nome da janela ${rotulo}`} value={c.janelas[k].nome} maxLength={30} onChange={e => setC(x => ({ ...x, janelas: { ...x.janelas, [k]: { ...x.janelas[k], nome: e.target.value } } }))} className={campo} />
      <input aria-label={`Início da janela ${rotulo}`} type="time" value={c.janelas[k].inicio} onChange={e => setC(x => ({ ...x, janelas: { ...x.janelas, [k]: { ...x.janelas[k], inicio: e.target.value } } }))} className={campo} />
      <input aria-label={`Fim da janela ${rotulo}`} type="time" value={c.janelas[k].fim} onChange={e => setC(x => ({ ...x, janelas: { ...x.janelas, [k]: { ...x.janelas[k], fim: e.target.value } } }))} className={campo} />
    </div>
  )
  return (
    <SecaoRecolhivel id="agendamento" icone={<CalendarClock size={16} className="text-primary" />}
      titulo="Agendamento de visitas e atendimentos"
      descricao="Quando o cliente pode pedir, o que ele pode mudar sozinho e os lembretes automáticos."
      resumo={`mínimo ${c.antecedencia_horas} h · ${c.lembretes.length} lembrete(s)`}>
      <div className="space-y-6" data-testid="agendamento-config">
        <div>
          <p className="text-xs font-medium mb-2">Datas que o cliente pode pedir</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm text-foreground">Antecedência mínima (horas)
              <input type="number" min={0} max={720} value={c.antecedencia_horas} onChange={e => setC(x => ({ ...x, antecedencia_horas: num(e.target.value) }))} className={campo + ' w-full mt-1'} data-testid="ag-antecedencia" /></label>
            <label className="text-sm text-foreground">Até quantos dias à frente
              <input type="number" min={1} max={365} value={c.horizonte_dias} onChange={e => setC(x => ({ ...x, horizonte_dias: num(e.target.value) }))} className={campo + ' w-full mt-1'} data-testid="ag-horizonte" /></label>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Ex.: 48 horas = o cliente só consegue pedir datas a partir de depois de amanhã. Feriados e dias sem expediente da unidade aparecem como aviso.</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-2">Janelas de atendimento</p>
          <div className="space-y-2">{janela('manha', 'Manhã')}{janela('tarde', 'Tarde')}</div>
          <p className="text-[11px] text-muted-foreground mt-1">O cliente escolhe a janela; "Qualquer horário" também fica disponível. Janelas mais curtas reduzem as ausências.</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-2">O que o cliente pode fazer sozinho</p>
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={c.cliente_reagenda} onChange={e => setC(x => ({ ...x, cliente_reagenda: e.target.checked }))} data-testid="ag-reagenda" /> Reagendar um atendimento confirmado</label>
          {c.cliente_reagenda && (
            <div className="grid sm:grid-cols-3 gap-3 mt-2 ml-6">
              <label className="text-xs text-muted-foreground">Até quantas horas antes
                <input type="number" min={0} max={720} value={c.reagendar_antecedencia_horas} onChange={e => setC(x => ({ ...x, reagendar_antecedencia_horas: num(e.target.value) }))} className={campo + ' w-full mt-1'} data-testid="ag-reag-antecedencia" /></label>
              <label className="text-xs text-muted-foreground">Máximo por chamado (0 = sem limite)
                <input type="number" min={0} max={10} value={c.max_reagendamentos_cliente} onChange={e => setC(x => ({ ...x, max_reagendamentos_cliente: num(e.target.value) }))} className={campo + ' w-full mt-1'} data-testid="ag-reag-max" /></label>
              <label className="text-xs text-muted-foreground flex items-end gap-2 pb-2"><input type="checkbox" checked={c.reagendar_motivo_obrigatorio} onChange={e => setC(x => ({ ...x, reagendar_motivo_obrigatorio: e.target.checked }))} /> Motivo obrigatório</label>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-3"><input type="checkbox" checked={c.cliente_cancela} onChange={e => setC(x => ({ ...x, cliente_cancela: e.target.checked }))} data-testid="ag-cancela" /> Cancelar o atendimento</label>
          {c.cliente_cancela && (
            <label className="text-xs text-muted-foreground block mt-2 ml-6">Até quantas horas antes da data
              <input type="number" min={0} max={720} value={c.cancelar_antecedencia_horas} onChange={e => setC(x => ({ ...x, cancelar_antecedencia_horas: num(e.target.value) }))} className={campo + ' w-32 mt-1 block'} /></label>
          )}
        </div>
        <div data-testid="ag-lembretes">
          <p className="text-xs font-medium mb-2">Lembretes por e-mail (até 3)</p>
          <div className="space-y-2">
            {c.lembretes.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-foreground">
                <input type="number" min={1} max={720} aria-label={`Lembrete ${i + 1}: horas antes`} value={l.antes_horas} onChange={e => setC(x => ({ ...x, lembretes: x.lembretes.map((y, k) => k === i ? { antes_horas: num(e.target.value) } : y) }))} className={campo + ' w-24'} />
                <span>horas antes</span>
                <button type="button" aria-label="Remover lembrete" onClick={() => setC(x => ({ ...x, lembretes: x.lembretes.filter((_, k) => k !== i) }))} className="text-muted-foreground"><X size={14} /></button>
              </div>
            ))}
          </div>
          {c.lembretes.length < 3 && <button type="button" onClick={() => setC(x => ({ ...x, lembretes: [...x.lembretes, { antes_horas: 2 }] }))} className="mt-2 text-xs text-primary inline-flex items-center gap-1" data-testid="ag-mais-lembrete"><Plus size={12} /> Adicionar lembrete</button>}
          <p className="text-[11px] text-muted-foreground mt-1">Cada lembrete leva "Confirmar presença", "Reagendar" e "Cancelar" (respeita o consentimento do cliente).</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="cta" size="sm" loading={salvando} onClick={salvar} data-testid="ag-salvar">Salvar</Button>
          {msg && <span className={'text-xs ' + (msg.ok ? 'text-green-400' : 'text-red-400')} role="status">{msg.texto}</span>}
        </div>
      </div>
    </SecaoRecolhivel>
  )
}
