import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, ArrowUp, ArrowDown, ArrowLeftRight, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useGrupos } from '@/hooks/useGrupos'
import { useTechnicians } from '@/hooks/useTechnicians'
import { DIRECOES, ROTULO_NIVEL_GRUPO, ehEquipeInterna } from '@/lib/grupos'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'

// Transferir a OS para outro grupo e/ou outro técnico (portal E2, migration 057).
// A regra mora no banco (função transferir_os): motivo obrigatório, direção
// pelo nível dos grupos, o SLA não reinicia, OS em andamento volta para "aberta".

export interface OSParaTransferir {
  id: string
  number: string
  status: string
  technician_id: string | null
  grupo_id?: string | null
}

const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground'

// Quem pode ver o botão (o banco confere de novo): equipe interna, técnico
// responsável ou coordenador do grupo atual
export function usePodeTransferir(o: Pick<OSParaTransferir, 'technician_id' | 'grupo_id' | 'status'> | null) {
  const { user } = useAuth()
  const { membros } = useGrupos()
  if (!o || !user || ['concluida', 'cancelada'].includes(o.status)) return false
  if (ehEquipeInterna(user.role)) return true
  if (o.technician_id === user.id) return true
  return !!o.grupo_id && membros.some(m => m.grupo_id === o.grupo_id && m.user_id === user.id && m.coordenador)
}

export function BotaoTransferir({ order, onDone, className }: { order: OSParaTransferir; onDone: () => void; className?: string }) {
  const [aberto, setAberto] = useState(false)
  const pode = usePodeTransferir(order)
  if (!pode) return null
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} data-testid="btn-transferir"
        className={className ?? 'w-full px-3 py-2 rounded-md text-sm font-medium border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 transition inline-flex items-center justify-center gap-2'}>
        <ArrowRightLeft size={14} /> Transferir
      </button>
      {aberto && <TransferirModal order={order} onFechar={() => setAberto(false)} onDone={() => { setAberto(false); onDone() }} />}
    </>
  )
}

function TransferirModal({ order, onFechar, onDone }: { order: OSParaTransferir; onFechar: () => void; onDone: () => void }) {
  const { user } = useAuth()
  const { ativos, membros } = useGrupos()
  const { technicians } = useTechnicians()
  const [modo, setModo] = useState<'grupo' | 'tecnico'>('grupo')
  const [grupo, setGrupo] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pedirGrupo, setPedirGrupo] = useState(false)

  const gruposDe = useCallback((uid: string) => membros.filter(m => m.user_id === uid).map(m => m.grupo_id), [membros])
  const interno = ehEquipeInterna(user?.role)   // quem vê todos os vínculos (o técnico vê só os próprios)

  const tecnicosOpc = useMemo(() => technicians.filter(t => t.active && t.id !== order.technician_id)
    .filter(t => modo === 'tecnico' || !grupo || !interno || gruposDe(t.id).includes(grupo)), [technicians, order.technician_id, modo, grupo, interno, gruposDe])
  const gruposDoTecnico = tecnico && interno ? gruposDe(tecnico) : []
  const precisaGrupo = modo === 'tecnico' && (gruposDoTecnico.length > 1 || pedirGrupo)
  const gruposOpc = precisaGrupo && gruposDoTecnico.length > 1 ? ativos.filter(g => gruposDoTecnico.includes(g.id)) : ativos

  useEffect(() => { setGrupo(''); setTecnico(''); setErro(''); setPedirGrupo(false) }, [modo])

  async function enviar() {
    setErro('')
    if (modo === 'grupo' && !grupo) { setErro('Escolha o grupo de destino.'); return }
    if (modo === 'tecnico' && !tecnico) { setErro('Escolha o técnico de destino.'); return }
    if (motivo.trim().length < 5) { setErro('Informe o motivo da transferência (mínimo 5 caracteres).'); return }
    setEnviando(true)
    // o grupo só vai junto quando foi pedido (modo grupo, ou técnico com vários grupos)
    const grupoEnviar = modo === 'grupo' || precisaGrupo ? grupo : ''
    const { error } = await supabase.rpc('transferir_os', {
      p_order: order.id, p_grupo: grupoEnviar || null, p_tecnico: tecnico || null, p_motivo: motivo,
    })
    setEnviando(false)
    if (error) {
      if (/mais de um grupo/i.test(error.message)) setPedirGrupo(true)
      setErro(error.message)
      return
    }
    onDone()
  }

  const grupoAtual = ativos.find(g => g.id === order.grupo_id)
  const grupoDestino = ativos.find(g => g.id === grupo)
  const previsao = grupoAtual && grupoDestino ? (() => {
    const r = (n: string) => ({ n1: 1, n2: 2, n3: 3, campo: 4 } as Record<string, number>)[n]
    const dir = grupoDestino.id === grupoAtual.id ? 'reatribuicao' : r(grupoDestino.nivel) > r(grupoAtual.nivel) ? 'escalonamento' : r(grupoDestino.nivel) < r(grupoAtual.nivel) ? 'devolucao' : 'lateral'
    return dir
  })() : null

  return (
    <Modal open onOpenChange={o => { if (!o) onFechar() }} title={`Transferir ${order.number}`} fecharAoClicarFora={false}
      description="Passe a OS para outro grupo e/ou para outro técnico. O prazo do SLA não reinicia.">
      <div className="space-y-4" data-testid="modal-transferir">
        <div className="flex gap-4 text-sm">
          {([['grupo', 'Para um grupo'], ['tecnico', 'Para um técnico']] as const).map(([v, r]) => (
            <label key={v} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="modo-transf" checked={modo === v} onChange={() => setModo(v)} data-testid={'modo-' + v} /> {r}
            </label>
          ))}
        </div>

        {(modo === 'grupo' || precisaGrupo) && (
          <div>
            <Label htmlFor="tr-grupo">{modo === 'grupo' ? 'Grupo de destino *' : 'Grupo do técnico *'}</Label>
            <select id="tr-grupo" value={grupo} onChange={e => setGrupo(e.target.value)} className={campo}>
              <option value="">Escolha…</option>
              {gruposOpc.map(g => <option key={g.id} value={g.id}>{g.nome} ({ROTULO_NIVEL_GRUPO[g.nivel]}){g.id === order.grupo_id ? ' — grupo atual' : ''}</option>)}
            </select>
            {modo === 'grupo' && <p className="text-[11px] text-muted-foreground mt-1">A OS cai na fila do grupo, sem técnico, para o coordenador ou os membros distribuírem.</p>}
          </div>
        )}
        {(modo === 'tecnico' || (modo === 'grupo' && grupo && interno)) && (
          <div>
            <Label htmlFor="tr-tec">{modo === 'tecnico' ? 'Técnico de destino *' : 'Técnico do grupo (opcional)'}</Label>
            <select id="tr-tec" value={tecnico} onChange={e => setTecnico(e.target.value)} className={campo}>
              <option value="">{modo === 'tecnico' ? 'Escolha…' : 'Nenhum — fica na fila do grupo'}</option>
              {tecnicosOpc.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {modo === 'tecnico' && gruposDoTecnico.length === 1 && <p className="text-[11px] text-muted-foreground mt-1">A OS passa também para o grupo deste técnico ({ativos.find(g => g.id === gruposDoTecnico[0])?.nome}).</p>}
          </div>
        )}

        {previsao && (
          <p className="text-xs text-cyan-300 inline-flex items-center gap-1.5" data-testid="previsao-direcao">
            {previsao === 'escalonamento' ? <ArrowUp size={13} /> : previsao === 'devolucao' ? <ArrowDown size={13} /> : <ArrowLeftRight size={13} />}
            {DIRECOES[previsao].rotulo} — {DIRECOES[previsao].descricao}
          </p>
        )}

        <div>
          <Label htmlFor="tr-motivo">Motivo * <span className="text-muted-foreground font-normal">(quem recebe lê isto para continuar de onde você parou)</span></Label>
          <textarea id="tr-motivo" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={500}
            placeholder="O que já foi feito e por que está passando adiante" className={campo + ' resize-none'} />
        </div>
        <p className="text-[11px] text-muted-foreground inline-flex items-start gap-1.5"><Info size={12} className="mt-0.5 flex-shrink-0" /> Se a OS estiver em andamento ou pausada, ela volta para "Aberta" com o destino. Você deixa de ver a OS se ela sair das suas.</p>
        {erro && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button variant="cta" loading={enviando} onClick={enviar} data-testid="confirmar-transferir">Transferir</Button>
        </div>
      </div>
    </Modal>
  )
}

// Histórico de transferências da OS, com o tempo em cada grupo
interface Transf {
  id: string; em: string; direcao: string; motivo: string
  de_grupo_id: string | null; para_grupo_id: string | null; de_tecnico_id: string | null; para_tecnico_id: string | null; por: string | null
}
function duracao(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h} h ${min % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`
}

export function HistoricoTransferencias({ orderId, criadaEm, grupoInicialId }: { orderId: string; criadaEm: string; grupoInicialId?: string | null }) {
  const { grupos } = useGrupos()
  const [linhas, setLinhas] = useState<Transf[] | null>(null)
  const [nomes, setNomes] = useState<Record<string, string>>({})

  useEffect(() => {
    let vivo = true
    supabase.from('os_transferencias').select('id, em, direcao, motivo, de_grupo_id, para_grupo_id, de_tecnico_id, para_tecnico_id, por')
      .eq('order_id', orderId).order('em').then(async ({ data }) => {
        if (!vivo) return
        const l = (data ?? []) as Transf[]
        setLinhas(l)
        const ids = [...new Set(l.flatMap(x => [x.de_tecnico_id, x.para_tecnico_id, x.por]).filter(Boolean))] as string[]
        if (ids.length) {
          const { data: us } = await supabase.from('users').select('id, name').in('id', ids)
          if (vivo) setNomes(Object.fromEntries((us ?? []).map((u: any) => [u.id, u.name])))
        }
      })
    return () => { vivo = false }
  }, [orderId])

  const g = (id: string | null) => (id ? grupos.find(x => x.id === id)?.nome ?? 'grupo removido' : 'sem grupo')
  if (!linhas || linhas.length === 0) return null

  // tempo em cada grupo: de uma transferência até a seguinte (a última segue até agora)
  const etapas = linhas.map((t, i) => ({
    grupo: g(t.para_grupo_id),
    inicio: new Date(t.em).getTime(),
    fim: i + 1 < linhas.length ? new Date(linhas[i + 1].em).getTime() : Date.now(),
  }))
  const primeiro = { grupo: g(linhas[0].de_grupo_id ?? grupoInicialId ?? null), inicio: new Date(criadaEm).getTime(), fim: new Date(linhas[0].em).getTime() }

  return (
    <div data-testid="historico-transferencias" className="space-y-3">
      <ol className="space-y-2">
        {linhas.map((t, i) => (
          <li key={t.id} className="text-xs" data-transferencia={i + 1}>
            <p className="text-foreground">
              <b>{i + 1}.</b> {g(t.de_grupo_id)}{t.de_tecnico_id ? ` (${nomes[t.de_tecnico_id] ?? '…'})` : ''} → {g(t.para_grupo_id)}{t.para_tecnico_id ? ` (${nomes[t.para_tecnico_id] ?? '…'})` : ''}
              <span className="ml-2 px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px]">{DIRECOES[t.direcao]?.rotulo ?? t.direcao}</span>
            </p>
            <p className="text-muted-foreground">{new Date(t.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · por {t.por ? nomes[t.por] ?? '…' : '—'}: {t.motivo}</p>
          </li>
        ))}
      </ol>
      <div className="pt-2 border-t border-border">
        <p className="text-[11px] text-muted-foreground mb-1">Tempo em cada grupo</p>
        <ul className="text-xs text-foreground space-y-0.5">
          {[primeiro, ...etapas].map((e, i) => <li key={i} className="flex justify-between gap-3"><span>{e.grupo}</span><span className="text-muted-foreground tabular-nums">{duracao(e.fim - e.inicio)}</span></li>)}
        </ul>
      </div>
    </div>
  )
}

