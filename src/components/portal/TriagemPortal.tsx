import { useMemo, useState } from 'react'
import { ClipboardCheck, Shuffle, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCategorias } from '@/hooks/useCatalogoSla'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { ROTULO_PRIORIDADE, dataHoraBR } from '@/lib/portalChamados'

// Triagem do N1 num chamado do portal (E5a): confirma a classificação do cliente ou reclassifica
// (prioridade e/ou assunto) com motivo obrigatório — o cliente vê o motivo na linha do tempo.
// Modo matriz: o N1 ajusta Impacto e Urgência e a prioridade sai da matriz; modo simples: escolhe a prioridade.
export interface InfoTriagem {
  tipo: string
  prioridade_informada: string | null
  prioridade_atual: string
  prioridade_modo: 'matriz' | 'simples'
  matriz: Record<string, Record<string, string>> | null
  impacto: string | null; urgencia: string | null
  categoria_id: string | null
  classificada_em: string | null; classificada_por: string | null
  reclassificacoes: { em: string; por: string | null; de: string | null; para: string | null; motivo: string | null; assunto: string | null }[]
}
const IMPACTO: [string, string][] = [['alto', 'Alto — a empresa toda ou o essencial parou'], ['medio', 'Médio — um setor ou uma unidade'], ['baixo', 'Baixo — uma pessoa ou algo pontual']]
const URGENCIA: [string, string][] = [['alta', 'Alta — precisa agora'], ['media', 'Média — pode esperar um pouco'], ['baixa', 'Baixa — sem pressa']]
const campo = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground'

export default function TriagemPortal({ orderId, info, podeTriar, onMudou }: { orderId: string; info: InfoTriagem; podeTriar: boolean; onMudou: () => void }) {
  const { opcoes } = useCategorias()
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [imp, setImp] = useState(info.impacto ?? 'medio')
  const [urg, setUrg] = useState(info.urgencia ?? 'media')
  const [prio, setPrio] = useState(info.prioridade_atual)
  const [cat, setCat] = useState('')
  const [motivo, setMotivo] = useState('')
  const incidente = info.tipo === 'incidente'
  const matriz = incidente && info.prioridade_modo === 'matriz'
  const resultado = useMemo(() => (matriz ? info.matriz?.[imp]?.[urg] : prio), [matriz, info.matriz, imp, urg, prio])
  const pendente = !info.classificada_em

  async function confirmar() {
    setErro(''); setSalvando(true)
    const { error } = await supabase.rpc('os_triagem', { p_order: orderId, p_acao: 'confirmar' })
    setSalvando(false)
    if (error) setErro(error.message); else onMudou()
  }
  async function reclassificar() {
    setErro('')
    if (motivo.trim().length < 3) { setErro('Informe o motivo: o cliente vai ler.'); return }
    setSalvando(true)
    const args: Record<string, unknown> = { p_order: orderId, p_acao: 'reclassificar', p_motivo: motivo.trim(), p_categoria: cat || null }
    if (matriz) { if (imp !== info.impacto || urg !== info.urgencia) { args.p_impacto = imp; args.p_urgencia = urg } }
    else if (incidente && prio !== info.prioridade_atual) args.p_prioridade = prio
    const { error } = await supabase.rpc('os_triagem', args)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setAberto(false); setMotivo(''); setCat(''); onMudou()
  }

  return (
    <div className="border-t border-primary/20 pt-3 space-y-2" data-testid="triagem">
      <p className="text-xs font-medium text-foreground inline-flex items-center gap-1.5"><ClipboardCheck size={13} className="text-primary" /> Triagem (N1)</p>
      <p className="text-xs text-muted-foreground" data-testid="triagem-estado">
        {info.prioridade_informada && incidente && <>Prioridade informada pelo cliente: <span className="text-foreground">{ROTULO_PRIORIDADE[info.prioridade_informada] ?? info.prioridade_informada}</span> · </>}
        {incidente && <>atual: <span className="text-foreground">{ROTULO_PRIORIDADE[info.prioridade_atual] ?? info.prioridade_atual}</span> · </>}
        {pendente
          ? <span className="text-amber-300">aguardando a triagem</span>
          : <span className="text-green-400 inline-flex items-center gap-1"><CheckCircle2 size={11} /> classificada{info.classificada_por ? ` por ${info.classificada_por}` : ''} em {dataHoraBR(info.classificada_em)}</span>}
      </p>
      {info.reclassificacoes.length > 0 && (
        <ul className="text-[11px] text-muted-foreground space-y-0.5" data-testid="reclassificacoes">
          {info.reclassificacoes.map((r, i) => (
            <li key={i}>{dataHoraBR(r.em)} · {r.por ?? 'Equipe'}: {r.de && r.para && r.de !== r.para ? `${ROTULO_PRIORIDADE[r.de] ?? r.de} → ${ROTULO_PRIORIDADE[r.para] ?? r.para}` : 'reclassificado'}{r.assunto ? ` · assunto: ${r.assunto}` : ''} — “{r.motivo}”</li>
          ))}
        </ul>
      )}
      {podeTriar && (
        <div className="flex flex-wrap gap-2">
          {pendente && <Button type="button" size="sm" variant="cta" loading={salvando} onClick={confirmar} data-testid="confirmar-triagem"><CheckCircle2 size={13} /> Confirmar prioridade</Button>}
          <Button type="button" size="sm" variant="outline" onClick={() => { setErro(''); setAberto(true) }} data-testid="abrir-reclassificar"><Shuffle size={13} /> Reclassificar</Button>
        </div>
      )}
      {erro && !aberto && <p className="text-xs text-red-400" role="alert">{erro}</p>}

      <Modal open={aberto} onOpenChange={setAberto} title="Reclassificar o chamado" description="O cliente vê o motivo na linha do tempo do chamado. O SLA recalcula a partir da abertura.">
        <div className="space-y-3 p-1" data-testid="form-reclassificar">
          {incidente && matriz && (<>
            <div><label htmlFor="rc-imp" className="block text-xs font-medium mb-1">Quem é afetado? (impacto)</label>
              <select id="rc-imp" value={imp} onChange={e => setImp(e.target.value)} className={campo}>{IMPACTO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
            <div><label htmlFor="rc-urg" className="block text-xs font-medium mb-1">Quanto atrapalha? (urgência)</label>
              <select id="rc-urg" value={urg} onChange={e => setUrg(e.target.value)} className={campo}>{URGENCIA.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
            <p className="text-xs text-muted-foreground">Prioridade resultante: <b className="text-foreground" data-testid="prioridade-resultante">{resultado ? (ROTULO_PRIORIDADE[resultado] ?? resultado) : '—'}</b></p>
          </>)}
          {incidente && !matriz && (
            <div><label htmlFor="rc-prio" className="block text-xs font-medium mb-1">Prioridade</label>
              <select id="rc-prio" value={prio} onChange={e => setPrio(e.target.value)} className={campo}>{Object.entries(ROTULO_PRIORIDADE).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
          )}
          <div><label htmlFor="rc-cat" className="block text-xs font-medium mb-1">Assunto (opcional — muda o grupo, se o assunto tiver grupo padrão)</label>
            <select id="rc-cat" value={cat} onChange={e => setCat(e.target.value)} className={campo}>
              <option value="">Manter o assunto atual</option>
              {opcoes.filter(o => o.value !== info.categoria_id).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></div>
          <div><label htmlFor="rc-motivo" className="block text-xs font-medium mb-1">Motivo * <span className="font-normal text-muted-foreground">(o cliente lê)</span></label>
            <textarea id="rc-motivo" rows={3} maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} className={campo} placeholder="Ex.: câmera isolada, sem impacto na operação" /></div>
          {erro && <p className="text-xs text-red-400" role="alert" data-testid="erro-reclassificar">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="button" variant="cta" size="sm" loading={salvando} onClick={reclassificar} data-testid="salvar-reclassificar">Reclassificar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
