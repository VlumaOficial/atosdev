import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, MessageCircle, Users2, Calendar, UserRound, Hand, Check, Send, Camera, X, MessagesSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { linkWhatsApp } from '@/lib/portal'
import { STATUS_CLIENTE, ROTULO_EVENTO, ROTULO_PERIODO, ROTULO_PRIORIDADE, dataBR, dataHoraBR, prepararFoto, enviarAnexos, type AnexoLocal, type DetalheChamado } from '@/lib/portalChamados'
import AnexosCliente from '@/components/portal/AnexosCliente'
import { usePortal } from './PortalContext'
import PortalPagina from './PortalPagina'
import StatusChamado from './StatusChamado'
import { cn } from '@/lib/utils'
import AguardandoVoce from './AguardandoVoce'

// Acompanhar o chamado: situação em etapas, dados, fotos e áudio, marcos e contato.
// Conversa com a empresa (E5a): respostas da empresa e mensagens do cliente, com até 3 fotos. A confirmação da solução chega na E5c.
const ETAPAS = ['recebido', 'agendado', 'em_atendimento', 'resolvido'] as const

export default function PortalChamado() {
  return <PortalPagina>{(_ctx, sessao) => <Detalhe userId={sessao.user.id} />}</PortalPagina>
}

function Detalhe({ userId }: { userId: string }) {
  const { id: chamadoId } = useParams()
  const { id, base } = usePortal()
  const [c, setC] = useState<DetalheChamado | null>(null)
  const [erro, setErro] = useState('')
  const [afetando, setAfetando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('portal_obter_chamado', { p_order: chamadoId })
    if (error) setErro('Chamado não encontrado.'); else setC(data as DetalheChamado)
  }, [chamadoId])
  useEffect(() => { carregar() }, [carregar])
  // acompanha mudanças de situação sem recarregar a página
  useEffect(() => { const t = setInterval(carregar, 30000); return () => clearInterval(t) }, [carregar])

  async function tambemAfeta() {
    setAfetando(true)
    const { error } = await supabase.rpc('portal_tambem_afeta', { p_order: chamadoId })
    setAfetando(false)
    if (!error) carregar()
  }

  if (erro) return <div><Link to={`${base}/chamados`} className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4"><ArrowLeft size={14} /> Chamados</Link><p className="text-sm text-muted-foreground" data-testid="chamado-nao-encontrado">{erro}</p></div>
  if (!c) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const passo = STATUS_CLIENTE[c.status].ordem
  const wa = linkWhatsApp(c.contatos?.whatsapp, `Olá, ${id.empresa}! Sobre o chamado ${c.numero} — ${c.titulo}`)
  return (
    <div data-testid="portal-chamado" data-numero={c.numero}>
      <Link to={`${base}/chamados`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"><ArrowLeft size={14} /> Chamados</Link>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><span className="text-xs font-mono text-primary">{c.numero}</span><h1 className="text-xl font-bold text-foreground">{c.titulo}</h1></div>
        {c.aguardando_voce ? <AguardandoVoce /> : <StatusChamado status={c.status} />}
      </div>

      {c.pausa && (
        <div className={cn('rounded-lg border p-4 mt-4', c.pausa.tipo === 'aciona' ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-secondary/40')} data-testid={c.pausa.tipo === 'aciona' ? 'banner-aguardando-voce' : 'banner-pausa'}>
          <p className={cn('text-sm font-medium', c.pausa.tipo === 'aciona' ? 'text-amber-200' : 'text-foreground')}>{c.pausa.tipo === 'aciona' ? 'Aguardando sua resposta' : `Em pausa: ${c.pausa.texto}`}</p>
          {c.pausa.tipo === 'aciona' && <p className="text-sm text-amber-100/90 mt-1 whitespace-pre-wrap" data-testid="pedido-da-empresa">{[...c.mensagens].reverse().find(m => m.autor === 'empresa')?.texto ?? c.pausa.texto}</p>}
          {c.pausa.tipo === 'aciona' && <p className="text-xs text-amber-100/70 mt-1">Responda na conversa abaixo: assim que você responder, a empresa retoma o atendimento.</p>}
          {c.pausa.tipo === 'comunica' && c.pausa.previsao && <p className="text-xs text-muted-foreground mt-1" data-testid="previsao-retorno">Previsão de retorno: {dataHoraBR(c.pausa.previsao)}</p>}
        </div>
      )}

      {c.status !== 'cancelado' && (
        <ol className="grid grid-cols-4 gap-1 mt-5" aria-label="Etapas do chamado" data-testid="etapas">
          {ETAPAS.map((e, i) => {
            const feito = passo >= STATUS_CLIENTE[e].ordem
            return (
              <li key={e} className="text-center" data-etapa={e} data-feito={feito}>
                <div className={cn('h-1.5 rounded-full', feito ? 'bg-primary' : 'bg-secondary')} />
                <p className={cn('text-[11px] mt-1.5 leading-tight', feito ? 'text-foreground' : 'text-muted-foreground')}>{feito && passo === STATUS_CLIENTE[e].ordem ? <b>{STATUS_CLIENTE[e].rotulo}</b> : STATUS_CLIENTE[e].rotulo}</p>
                <span className="sr-only">{i + 1} de 4</span>
              </li>
            )
          })}
        </ol>
      )}

      {c.agendado_para && c.status === 'agendado' && (
        <div className="vluma-card p-4 mt-4 flex items-start gap-3 border-purple-500/30" data-testid="agendado-para">
          <Calendar size={18} className="text-purple-400 mt-0.5" /><div><p className="text-sm font-medium text-foreground">Atendimento agendado</p><p className="text-sm text-muted-foreground">{dataHoraBR(c.agendado_para)}</p></div>
        </div>
      )}
      {c.tecnico && (
        <p className="text-sm text-muted-foreground mt-3 inline-flex items-center gap-2" data-testid="tecnico"><UserRound size={14} /> Técnico responsável: <span className="text-foreground">{c.tecnico}</span></p>
      )}

      <div className="vluma-card p-4 mt-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div><p>Assunto</p><p className="text-foreground text-sm">{c.categoria ? (c.categoria.pai ? `${c.categoria.pai} › ${c.categoria.nome}` : c.categoria.nome) : '—'}</p></div>
          <div><p>Unidade</p><p className="text-foreground text-sm">{c.unidade ?? '—'}</p></div>
          <div><p>Aberto em</p><p className="text-foreground text-sm">{dataHoraBR(c.criado_em)}</p></div>
          <div><p>Aberto por</p><p className="text-foreground text-sm">{c.solicitante ?? '—'}</p></div>
        </div>
        {c.descricao && <div><p className="text-xs text-muted-foreground mb-1">Descrição</p><p className="text-foreground whitespace-pre-wrap">{c.descricao}</p></div>}
        {c.equipe && <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Users2 size={12} /> Equipe {c.equipe} — {c.compartilhado ? 'compartilhado com a equipe' : 'só você e o Supervisor veem'}</p>}
        {c.preferencias && c.preferencias.length > 0 && (
          <div><p className="text-xs text-muted-foreground mb-1">Datas que você pediu</p>
            <ul className="text-sm text-foreground space-y-0.5">{c.preferencias.map((p, i) => <li key={i}>{dataBR(p.data)} — {ROTULO_PERIODO[p.periodo] ?? p.periodo}</li>)}</ul></div>
        )}
      </div>

      {c.anexos.length > 0 && <div className="mt-4"><p className="text-sm font-medium text-foreground mb-2">Fotos e áudio enviados</p><AnexosCliente anexos={c.anexos} /></div>}

      {c.afetados > 1 || (!c.meu && c.status !== 'resolvido' && c.status !== 'cancelado') ? (
        <div className="vluma-card p-4 mt-4 flex flex-wrap items-center justify-between gap-3" data-testid="afetados">
          <p className="text-sm text-foreground inline-flex items-center gap-2"><Users2 size={15} className="text-muted-foreground" /> {c.afetados} {c.afetados === 1 ? 'pessoa afetada' : 'pessoas afetadas'}</p>
          {!c.meu && !c.eu_afetado && c.status !== 'resolvido' && c.status !== 'cancelado' && (
            <button onClick={tambemAfeta} disabled={afetando} data-testid="tambem-afeta" className="px-3 py-1.5 rounded-md border border-primary/40 text-primary text-sm inline-flex items-center gap-1.5"><Hand size={14} /> Também me afeta</button>
          )}
          {c.eu_afetado && <span className="text-xs text-green-400 inline-flex items-center gap-1"><Check size={12} /> Você marcou que também é afetado</span>}
        </div>
      ) : null}

      <Conversa c={c} userId={userId} tenantId={id.tenant_id} onEnviou={carregar} />

      <div className="mt-5">
        <p className="text-sm font-medium text-foreground mb-2">Andamento</p>
        <ol className="space-y-2" data-testid="linha-do-tempo">
          {c.linha_do_tempo.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" data-evento={e.evento}><span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span>
                <span className="text-foreground">
                  {e.evento === 'reclassified'
                    ? (e.detalhe?.de && e.detalhe?.para && e.detalhe.de !== e.detalhe.para
                        ? `Prioridade ajustada de ${ROTULO_PRIORIDADE[e.detalhe.de] ?? e.detalhe.de} para ${ROTULO_PRIORIDADE[e.detalhe.para] ?? e.detalhe.para}`
                        : 'Chamado reclassificado') + (e.detalhe?.assunto ? ` · assunto: ${e.detalhe.assunto}` : '')
                    : <>{ROTULO_EVENTO[e.evento] ?? e.evento}{e.evento === 'scheduled' && e.para ? ` para ${dataHoraBR(e.para)}` : ''}</>}
                </span>{' '}
                <span className="text-xs text-muted-foreground">{dataHoraBR(e.em)}</span>
                {e.evento === 'reclassified' && e.detalhe?.motivo && <span className="block text-xs text-muted-foreground" data-testid="motivo-reclassificacao">Motivo: {e.detalhe.motivo}</span>}
              </span></li>
          ))}
        </ol>
      </div>

      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" data-testid="wa-chamado"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-green-600 hover:bg-green-500 text-white text-sm font-medium"><MessageCircle size={16} /> Falar pelo WhatsApp sobre este chamado</a>
      )}
    </div>
  )
}


// Conversa pública do chamado: o que a empresa respondeu e o que o cliente (ou a equipe dele) escreveu
function Conversa({ c, userId, tenantId, onEnviou }: { c: DetalheChamado; userId: string; tenantId: string; onEnviou: () => void }) {
  const [texto, setTexto] = useState('')
  const [fotos, setFotos] = useState<AnexoLocal[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const entrada = useRef<HTMLInputElement>(null)

  async function adicionar(files: FileList | null) {
    if (!files) return
    setErro('')
    try {
      for (const f of Array.from(files)) {
        if (fotos.length >= 3) { setErro('No máximo 3 fotos por mensagem.'); break }
        const a = await prepararFoto(f)
        setFotos(l => (l.length < 3 ? [...l, a] : l))
      }
    } catch (e) { setErro((e as Error).message) }
    if (entrada.current) entrada.current.value = ''
  }
  async function enviar() {
    setErro('')
    if (texto.trim().length < 2) { setErro('Escreva a mensagem.'); return }
    setEnviando(true)
    try {
      const up = fotos.length ? await enviarAnexos(tenantId, c.client_id, userId, fotos) : []
      const { error } = await supabase.rpc('portal_enviar_mensagem', { p_order: c.id, p_texto: texto.trim(), p_anexos: up })
      if (error) { if (up.length) await supabase.storage.from('portal-anexos').remove(up.map(x => x.path)); throw new Error(error.message) }
      fotos.forEach(f => URL.revokeObjectURL(f.url))
      setTexto(''); setFotos([]); onEnviou()
    } catch (e) { setErro((e as Error).message) } finally { setEnviando(false) }
  }

  return (
    <div className="mt-5" data-testid="conversa">
      <p className="text-sm font-medium text-foreground mb-2 inline-flex items-center gap-1.5"><MessagesSquare size={15} /> Conversa com a empresa</p>
      {c.mensagens.length === 0
        ? <p className="text-xs text-muted-foreground mb-3" data-testid="conversa-vazia">Ainda não há mensagens. Se precisar acrescentar alguma informação, escreva abaixo.</p>
        : (
          <ul className="space-y-2 mb-3" data-testid="mensagens">
            {c.mensagens.map(m => (
              <li key={m.id} data-autor={m.autor}
                className={cn('rounded-lg border p-3 text-sm', m.autor === 'empresa' ? 'bg-primary/5 border-primary/25' : 'bg-secondary/40 border-border')}>
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{m.autor === 'empresa' ? `${m.nome} · atendimento` : m.nome}</span> · {dataHoraBR(m.em)}</p>
                <p className="text-foreground whitespace-pre-wrap mt-1">{m.texto}</p>
                {m.anexos.length > 0 && <div className="mt-2 max-w-xs"><AnexosCliente anexos={m.anexos} /></div>}
              </li>
            ))}
          </ul>
        )}
      {c.pode_responder ? (
        <div className="space-y-2">
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} maxLength={2000} aria-label="Sua mensagem" data-testid="mensagem-texto"
            placeholder={c.aguardando_voce ? 'Responda aqui para a empresa retomar o atendimento…' : 'Escreva sua mensagem para a empresa…'}
            className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          {fotos.length > 0 && (
            <ul className="flex gap-2" data-testid="mensagem-fotos">
              {fotos.map(f => (
                <li key={f.id} className="relative w-16 h-16 rounded-md overflow-hidden border border-border">
                  <img src={f.url} alt={f.nome} className="w-full h-full object-cover" />
                  <button type="button" aria-label="Remover foto" onClick={() => { URL.revokeObjectURL(f.url); setFotos(l => l.filter(x => x.id !== f.id)) }}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white inline-flex items-center justify-center"><X size={11} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={entrada} type="file" accept="image/*" multiple className="hidden" onChange={e => adicionar(e.target.files)} data-testid="mensagem-input-foto" />
            <button type="button" disabled={fotos.length >= 3} onClick={() => entrada.current?.click()}
              className="px-3 py-2 rounded-md border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><Camera size={15} /> Foto</button>
            <button type="button" onClick={enviar} disabled={enviando || texto.trim().length < 2} data-testid="enviar-mensagem"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-60">
              {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar mensagem</button>
          </div>
          {erro && <p className="text-xs text-red-400" role="alert" data-testid="erro-mensagem">{erro}</p>}
        </div>
      ) : <p className="text-xs text-muted-foreground">Este chamado foi cancelado: não recebe novas mensagens.</p>}
    </div>
  )
}
