import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarCheck, CalendarClock, Check, Loader2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/modal'
import OpcoesDatas, { type OpcaoData } from './OpcoesDatas'
import { dataBR, dataHoraBR, rotulosPeriodo, type DetalheChamado } from '@/lib/portalChamados'
import { cn } from '@/lib/utils'

// Agendamento combinado (E5b): aceitar a data proposta / confirmar presença, pedir outra data (reagendar) e cancelar,
// nos limites que a empresa configurou. Os mesmos botões chegam por e-mail (lembretes: ?acao=confirmar|reagendar|cancelar).
const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

export default function AgendamentoCliente({ c, onMudou }: { c: DetalheChamado; onMudou: () => void }) {
  const a = c.agendamento
  const [params, setParams] = useSearchParams()
  const [dialogo, setDialogo] = useState<null | 'outra' | 'cancelar'>(null)
  const [opcoes, setOpcoes] = useState<OpcaoData[]>([{ data: '', periodo: 'qualquer' }])
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const tratou = useRef(false)

  async function responder(acao: 'aceitar' | 'outra_data') {
    setErro(''); setOcupado(true)
    const args: Record<string, unknown> = { p_order: c.id, p_acao: acao }
    if (acao === 'outra_data') { args.p_opcoes = opcoes.filter(o => o.data); args.p_motivo = motivo.trim() || null }
    const { error } = await supabase.rpc('portal_responder_agendamento', args)
    setOcupado(false)
    if (error) { setErro(error.message); return false }
    setDialogo(null); setMotivo(''); setMsg(acao === 'aceitar' ? 'Presença confirmada. Obrigado!' : 'Pedido enviado: a empresa vai responder com a nova data.'); onMudou()
    return true
  }
  async function cancelar() {
    setErro(''); setOcupado(true)
    const { error } = await supabase.rpc('portal_cancelar_agendamento', { p_order: c.id, p_motivo: motivo.trim() || null })
    setOcupado(false)
    if (error) { setErro(error.message); return }
    setDialogo(null); setMotivo(''); onMudou()
  }

  // links do e-mail de lembrete
  useEffect(() => {
    const acao = params.get('acao')
    if (!acao || !a || tratou.current) return
    tratou.current = true
    const limpar = () => { const p = new URLSearchParams(params); p.delete('acao'); setParams(p, { replace: true }) }
    if (acao === 'confirmar' && a.pode_aceitar) responder('aceitar').finally(limpar)
    else if (acao === 'reagendar' && a.pode_pedir_outra) { setDialogo('outra'); limpar() }
    else if (acao === 'cancelar' && a.pode_cancelar) { setDialogo('cancelar'); limpar() }
    else limpar()
  }, [a]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) return null
  const rot = rotulosPeriodo(a.config)
  const agendado = c.status === 'agendado'
  if (!agendado && !a.pode_cancelar) return null

  return (
    <div className="mt-3" data-testid="agendamento" data-agendamento={a.status ?? 'nenhum'}>
      {agendado && a.status === 'proposto' && (
        <div className="rounded-lg border border-purple-500/40 bg-purple-500/10 p-4" data-testid="proposta-data">
          <p className="text-sm font-medium text-purple-200 inline-flex items-center gap-2"><CalendarClock size={16} /> Proposta de data</p>
          <p className="text-sm text-foreground mt-1">A empresa propõe atender em <b>{dataHoraBR(a.para)}</b>. Essa data serve para você?</p>
        </div>
      )}
      {agendado && a.status === 'confirmado' && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5" data-testid="data-confirmada"><CalendarCheck size={13} className="text-green-400" />
          {a.confirmado_em ? `Você confirmou presença em ${dataHoraBR(a.confirmado_em)}.` : 'Data confirmada.'}</p>
      )}
      {agendado && a.status === 'reagendamento_pedido' && (
        <div className="rounded-lg border border-border bg-secondary/40 p-4" data-testid="pedido-enviado">
          <p className="text-sm font-medium text-foreground inline-flex items-center gap-2"><CalendarClock size={16} /> Você pediu outra data</p>
          <ul className="text-sm text-muted-foreground mt-1 space-y-0.5">{(a.pedido ?? []).map((o, i) => <li key={i}>{dataBR(o.data)} — {rot[o.periodo] ?? o.periodo}</li>)}</ul>
          {a.motivo_pedido && <p className="text-xs text-muted-foreground mt-1">Motivo: {a.motivo_pedido}</p>}
          <p className="text-xs text-muted-foreground mt-2">Aguardando a empresa. Enquanto isso, a data anterior continua valendo.</p>
        </div>
      )}
      {msg && <p className="text-sm text-green-400 mt-2" role="status" data-testid="msg-agendamento">{msg}</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        {agendado && a.pode_aceitar && (
          <button type="button" onClick={() => responder('aceitar')} disabled={ocupado} data-testid="aceitar-data"
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-60">{ocupado ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {a.status === 'proposto' ? 'Aceitar esta data' : 'Confirmar presença'}</button>
        )}
        {agendado && a.pode_pedir_outra && (
          <button type="button" onClick={() => { setErro(''); setDialogo('outra') }} data-testid="pedir-outra-data"
            className="px-3 py-2 rounded-md border border-border text-sm text-foreground inline-flex items-center gap-1.5"><CalendarClock size={14} /> {a.status === 'proposto' ? 'Pedir outra data' : 'Reagendar'}</button>
        )}
        {a.pode_cancelar && (
          <button type="button" onClick={() => { setErro(''); setDialogo('cancelar') }} data-testid="cancelar-atendimento"
            className="px-3 py-2 rounded-md border border-red-500/30 text-sm text-red-300 inline-flex items-center gap-1.5"><XCircle size={14} /> {agendado ? 'Cancelar atendimento' : 'Cancelar este chamado'}</button>
        )}
      </div>
      {agendado && a.status === 'confirmado' && a.cliente_reagenda && !a.pode_pedir_outra && (
        <p className="text-[11px] text-muted-foreground mt-2" data-testid="sem-reagendar">Para reagendar agora, fale com a empresa
          {a.reagendamentos_limite > 0 && a.reagendamentos_usados >= a.reagendamentos_limite ? ` (você já usou os ${a.reagendamentos_limite} reagendamentos pelo portal)` : ` (pelo portal é possível até ${a.reagendar_antecedencia_horas} horas antes)`}.</p>
      )}

      <Modal open={dialogo === 'outra'} onOpenChange={o => !o && setDialogo(null)} title={a.status === 'proposto' ? 'Pedir outra data' : 'Reagendar o atendimento'} description="Informe até 3 opções. A empresa confirma uma delas.">
        <div className="space-y-3 p-1" data-testid="form-outra-data">
          <OpcoesDatas opcoes={opcoes} setOpcoes={setOpcoes} config={a.config} />
          <div><label htmlFor="outra-motivo" className="block text-xs font-medium mb-1">Motivo {a.motivo_obrigatorio && a.status !== 'proposto' ? '*' : '(opcional)'}</label>
            <textarea id="outra-motivo" rows={2} maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} className={campo} data-testid="outra-motivo" /></div>
          {erro && <p className="text-xs text-red-400" role="alert" data-testid="erro-agendamento">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDialogo(null)} className="px-3 py-2 rounded-md border border-border text-sm">Voltar</button>
            <button type="button" onClick={() => responder('outra_data')} disabled={ocupado || !opcoes.some(o => o.data)} data-testid="enviar-outra-data" className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">Enviar pedido</button>
          </div>
        </div>
      </Modal>
      <Modal open={dialogo === 'cancelar'} onOpenChange={o => !o && setDialogo(null)} title={agendado ? 'Cancelar o atendimento' : 'Cancelar o chamado'} description={`Você pode cancelar até ${a.cancelar_antecedencia_horas} horas antes da data agendada.`}>
        <div className="space-y-3 p-1" data-testid="form-cancelar">
          <div><label htmlFor="cancelar-motivo" className="block text-xs font-medium mb-1">Motivo (opcional)</label>
            <textarea id="cancelar-motivo" rows={2} maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} className={campo} data-testid="cancelar-motivo" /></div>
          {erro && <p className="text-xs text-red-400" role="alert" data-testid="erro-agendamento">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDialogo(null)} className="px-3 py-2 rounded-md border border-border text-sm">Voltar</button>
            <button type="button" onClick={cancelar} disabled={ocupado} data-testid="confirmar-cancelar" className={cn('px-3 py-2 rounded-md text-sm font-medium bg-red-500/20 text-red-200 border border-red-500/40 disabled:opacity-60')}>Cancelar mesmo</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
