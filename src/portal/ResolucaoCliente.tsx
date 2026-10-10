import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileText, Loader2, ThumbsDown, ThumbsUp, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/modal'
import { usePortal } from './PortalContext'
import { dataBR, dataHoraBR, type DetalheChamado } from '@/lib/portalChamados'

// Resolvido → Fechado (E5c): o cliente confirma a solução ou diz que NÃO foi resolvido (reabre); depois de fechado, abre um novo chamado ligado
const FECHOU: Record<string, string> = { confirmada: 'você confirmou a solução', assinatura: 'a sua assinatura em campo confirmou a solução', automatica: 'sem resposta, o chamado foi fechado automaticamente' }

export default function ResolucaoCliente({ c, onMudou }: { c: DetalheChamado; onMudou: () => void }) {
  const { base } = usePortal()
  const r = c.resolucao
  const [dialogo, setDialogo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState<'confirmar' | 'nao' | 'pdf' | null>(null)
  if (!r) return null

  async function confirmar() {
    setErro(''); setOcupado('confirmar')
    const { error } = await supabase.rpc('portal_confirmar_solucao', { p_order: c.id })
    setOcupado(null)
    if (error) setErro(error.message); else onMudou()
  }
  async function naoResolvido() {
    setErro(''); setOcupado('nao')
    const { error } = await supabase.rpc('portal_nao_resolvido', { p_order: c.id, p_motivo: motivo.trim() })
    setOcupado(null)
    if (error) { setErro(error.message); return }
    setDialogo(false); setMotivo(''); onMudou()
  }
  async function baixar() {
    setErro(''); setOcupado('pdf')
    const { data, error } = await supabase.functions.invoke('portal-relatorio', { body: { order_id: c.id } })
    setOcupado(null)
    if (error || !(data as any)?.url) { setErro('Não foi possível abrir o relatório agora.'); return }
    window.open((data as any).url, '_blank', 'noopener')
  }

  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 mt-4" data-testid="resolucao" data-fechado={r.fechada_em ? 'sim' : 'nao'}>
      <p className="text-sm font-medium text-green-300 inline-flex items-center gap-2"><CheckCircle2 size={16} /> {r.fechada_em ? 'Chamado fechado' : 'Chamado resolvido'}</p>
      {r.resumo && <div className="mt-2" data-testid="resumo-resolucao"><p className="text-xs text-muted-foreground">O que foi feito</p><p className="text-sm text-foreground whitespace-pre-wrap">{r.resumo}</p></div>}
      <p className="text-xs text-muted-foreground mt-2">Resolvido em {dataHoraBR(r.concluida_em)}.{r.fechada_em && r.fechamento_tipo ? ` Fechado em ${dataHoraBR(r.fechada_em)}: ${FECHOU[r.fechamento_tipo]}.` : ''}</p>
      {r.relatorio && (
        <button type="button" onClick={baixar} disabled={ocupado === 'pdf'} data-testid="baixar-relatorio" className="mt-3 px-3 py-2 rounded-md border border-border text-sm text-foreground inline-flex items-center gap-1.5 disabled:opacity-60">
          {ocupado === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Ver o relatório do atendimento (PDF)</button>
      )}
      {!r.fechada_em && (
        <div className="mt-4" data-testid="confirmar-resolucao">
          <p className="text-sm text-foreground">O problema foi resolvido?</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {r.pode_confirmar && <button type="button" onClick={confirmar} disabled={!!ocupado} data-testid="confirmar-solucao" className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-60">{ocupado === 'confirmar' ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />} Confirmar solução</button>}
            {r.pode_nao_resolvido && <button type="button" onClick={() => { setErro(''); setDialogo(true) }} data-testid="nao-resolvido" className="px-3 py-2 rounded-md border border-red-500/30 text-sm text-red-300 inline-flex items-center gap-1.5"><ThumbsDown size={14} /> Não foi resolvido</button>}
          </div>
          {r.fecha_em && <p className="text-[11px] text-muted-foreground mt-2" data-testid="fecha-em">Se não houver resposta, o chamado será fechado automaticamente em {dataBR(r.fecha_em)}.</p>}
        </div>
      )}
      {r.pode_novo_chamado && (
        <div className="mt-4" data-testid="novo-relacionado">
          <p className="text-xs text-muted-foreground">O problema voltou ou surgiu outro? Um chamado fechado não reabre, mas você pode abrir um novo ligado a este.</p>
          <Link to={`${base}/abrir?relacionado=${c.id}`} data-testid="abrir-relacionado" className="mt-2 px-3 py-2 rounded-md border border-primary/40 text-sm text-primary inline-flex items-center gap-1.5"><Plus size={14} /> Abrir novo chamado relacionado</Link>
        </div>
      )}
      {erro && !dialogo && <p className="text-xs text-red-400 mt-2" role="alert" data-testid="erro-resolucao">{erro}</p>}
      <Modal open={dialogo} onOpenChange={setDialogo} title="Não foi resolvido" description="Conte o que continua errado. O atendimento volta para o mesmo técnico e o tempo até agora não conta no prazo.">
        <div className="space-y-3 p-1" data-testid="form-nao-resolvido">
          <textarea rows={3} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} aria-label="O que continua errado" data-testid="motivo-nao-resolvido"
            className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground" placeholder="Ex.: a internet voltou, mas cai a cada 10 minutos" />
          {erro && <p className="text-xs text-red-400" role="alert" data-testid="erro-nao-resolvido">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDialogo(false)} className="px-3 py-2 rounded-md border border-border text-sm">Voltar</button>
            <button type="button" onClick={naoResolvido} disabled={ocupado === 'nao' || motivo.trim().length < 3} data-testid="enviar-nao-resolvido" className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">Reabrir o chamado</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
