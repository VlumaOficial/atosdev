import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, MessageCircle, Users2, Calendar, UserRound, Hand, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { linkWhatsApp } from '@/lib/portal'
import { STATUS_CLIENTE, ROTULO_EVENTO, ROTULO_PERIODO, dataBR, dataHoraBR, type DetalheChamado } from '@/lib/portalChamados'
import AnexosCliente from '@/components/portal/AnexosCliente'
import { usePortal } from './PortalContext'
import PortalPagina from './PortalPagina'
import StatusChamado from './StatusChamado'
import { cn } from '@/lib/utils'

// Acompanhar o chamado: situação em etapas, dados, fotos e áudio, marcos e contato.
// (A conversa com a empresa e a confirmação da solução chegam na E5.)
const ETAPAS = ['recebido', 'agendado', 'em_atendimento', 'resolvido'] as const

export default function PortalChamado() {
  return <PortalPagina>{() => <Detalhe />}</PortalPagina>
}

function Detalhe() {
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
        <StatusChamado status={c.status} />
      </div>

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

      <div className="mt-5">
        <p className="text-sm font-medium text-foreground mb-2">Andamento</p>
        <ol className="space-y-2" data-testid="linha-do-tempo">
          {c.linha_do_tempo.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-sm"><span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span><span className="text-foreground">{ROTULO_EVENTO[e.evento] ?? e.evento}{e.evento === 'scheduled' && e.para ? ` para ${dataHoraBR(e.para)}` : ''}</span> <span className="text-xs text-muted-foreground">· {dataHoraBR(e.em)}</span></span></li>
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
