import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/modal'
import OpcoesDatas, { type OpcaoData } from './OpcoesDatas'
import { usePortal } from './PortalContext'
import type { DetalheChamado } from '@/lib/portalChamados'

// Visita não realizada (cliente ausente, sem acesso…): o cliente vê o motivo e pode pedir uma nova visita, ligada à anterior
export default function NovaVisita({ c }: { c: DetalheChamado }) {
  const { base } = usePortal()
  const navigate = useNavigate()
  const cancel = c.cancelamento!
  const [aberto, setAberto] = useState(false)
  const [opcoes, setOpcoes] = useState<OpcaoData[]>([{ data: '', periodo: 'qualquer' }])
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function pedir() {
    setErro(''); setOcupado(true)
    const { data, error } = await supabase.rpc('portal_pedir_nova_visita', { p_order: c.id, p_opcoes: opcoes.filter(o => o.data), p_obs: obs.trim() || null })
    setOcupado(false)
    if (error) { setErro(error.message); return }
    setAberto(false); navigate(`${base}/chamados/${(data as any).id}`)
  }
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 mt-3" data-testid="visita-nao-realizada">
      <p className="text-sm font-medium text-amber-200 inline-flex items-center gap-2"><AlertTriangle size={16} /> {cancel.texto}</p>
      {cancel.pode_pedir_nova_visita
        ? <button type="button" onClick={() => { setErro(''); setAberto(true) }} data-testid="pedir-nova-visita" className="mt-3 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"><CalendarPlus size={14} /> Pedir nova visita</button>
        : <p className="text-xs text-amber-100/80 mt-1">Já existe uma nova visita em andamento para este chamado.</p>}
      <Modal open={aberto} onOpenChange={setAberto} title="Pedir nova visita" description="Informe até 3 opções de data. A empresa confirma uma delas.">
        <div className="space-y-3 p-1" data-testid="form-nova-visita">
          <OpcoesDatas opcoes={opcoes} setOpcoes={setOpcoes} config={c.config_agendamento} />
          <div><label htmlFor="nv-obs" className="block text-xs font-medium mb-1">Observação (opcional)</label>
            <textarea id="nv-obs" rows={2} maxLength={500} value={obs} onChange={e => setObs(e.target.value)} className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground" data-testid="nv-obs" /></div>
          {erro && <p className="text-xs text-red-400" role="alert" data-testid="erro-nova-visita">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAberto(false)} className="px-3 py-2 rounded-md border border-border text-sm">Voltar</button>
            <button type="button" onClick={pedir} disabled={ocupado || !opcoes.some(o => o.data)} data-testid="enviar-nova-visita" className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">Pedir visita</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
