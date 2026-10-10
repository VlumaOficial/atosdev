import { useEffect, useState } from 'react'
import { Headset, Users2, MessageCircle, Calendar, Hand } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { linkWhatsApp } from '@/lib/portal'
import { ROTULO_PERIODO, dataBR, dataHoraBR, type AnexoChamado } from '@/lib/portalChamados'
import AnexosCliente from './AnexosCliente'
import TriagemPortal, { type InfoTriagem } from './TriagemPortal'

// "Aberto pelo portal": quem abriu, equipe, quantas pessoas são afetadas, o que o cliente informou
// de prioridade, as datas que pediu, fotos e áudio. A equipe interna vê contato; o técnico, só o nome.
interface Info extends InfoTriagem {
  origem: string
  solicitante: { nome: string; email: string | null; celular: string | null } | null
  equipe: string | null; compartilhado: boolean; afetados: number
  preferencias: { data: string; periodo: string }[] | null
  anexos: AnexoChamado[]
  portal_host: string | null
  aguardando_cliente_desde?: string | null; previsao_retorno?: string | null; reagendamentos?: number
  agendamento_status?: 'proposto' | 'confirmado' | 'reagendamento_pedido' | null; agendamento_cliente_em?: string | null
  reagendamento_motivo?: string | null; reagendamentos_cliente?: number
  janelas?: { manha: { nome: string; inicio: string; fim: string }; tarde: { nome: string; inicio: string; fim: string } }
}
const HORA_PADRAO: Record<string, string> = { manha: '09:00', tarde: '14:00', qualquer: '09:00' }

export default function PortalInfoOS({ orderId, numero, titulo, prioridadeAtual, onAgendar, compacto = false, podeTriar = false, onMudou }: {
  orderId: string; numero: string; titulo: string; prioridadeAtual?: string; onAgendar?: (isoLocal: string) => void; compacto?: boolean
  podeTriar?: boolean; onMudou?: () => void   // triagem do N1 (E5a): confirmar/reclassificar
}) {
  const { tenant } = useAuth()
  const [info, setInfo] = useState<Info | null>(null)
  const carregar = () => supabase.rpc('portal_info_chamado', { p_order: orderId }).then(({ data }) => setInfo((data as Info) ?? null))
  useEffect(() => { carregar() }, [orderId, prioridadeAtual]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!info) return null

  const empresa = (tenant?.trade_name || tenant?.name || '').replace(/\.$/, '')
  const wa = info.solicitante?.celular
    ? linkWhatsApp(info.solicitante.celular, `Olá, ${info.solicitante.nome.split(' ')[0]}! Aqui é da ${empresa}. Sobre o seu chamado ${numero} (${titulo}).${info.portal_host ? ` Acompanhe em https://${info.portal_host}/chamados/${orderId}` : ''}`) : null

  return (
    <div className="rounded-md border border-primary/25 bg-primary/5 p-4 space-y-3" data-testid="info-portal">
      <p className="text-sm font-medium text-foreground inline-flex items-center gap-2"><Headset size={15} className="text-primary" /> Aberto pelo portal do cliente</p>
      <div className="text-sm space-y-1">
        {info.solicitante && <p className="text-foreground" data-testid="solicitante-portal">{info.solicitante.nome}{info.solicitante.email ? <span className="text-xs text-muted-foreground"> · {info.solicitante.email}</span> : null}{info.solicitante.celular ? <span className="text-xs text-muted-foreground"> · {info.solicitante.celular}</span> : null}</p>}
        {info.agendamento_status === 'proposto' && <p className="text-xs text-purple-300" data-testid="agendamento-proposto-os">Proposta de data enviada ao cliente — aguardando a resposta dele (aceitar ou pedir outra data).</p>}
        {info.agendamento_status === 'confirmado' && <p className="text-xs text-green-400" data-testid="agendamento-confirmado-os">{info.agendamento_cliente_em ? `Cliente confirmou presença em ${dataHoraBR(info.agendamento_cliente_em)}.` : 'Data confirmada (uma das pedidas ou combinada com o cliente).'}</p>}
        {info.agendamento_status === 'reagendamento_pedido' && <p className="text-xs text-amber-300" data-testid="agendamento-pedido-os">O cliente pediu outra data{info.reagendamento_motivo ? `: “${info.reagendamento_motivo}”` : ''} — escolha uma das datas abaixo.</p>}
        {(info.reagendamentos_cliente ?? 0) > 0 && <p className="text-xs text-muted-foreground">Reagendamentos pedidos pelo cliente: {info.reagendamentos_cliente}</p>}
        {info.aguardando_cliente_desde && <p className="text-xs text-amber-300" data-testid="aguardando-cliente-os">Aguardando o cliente desde {dataHoraBR(info.aguardando_cliente_desde)} — ele responde pelo portal e a OS retoma sozinha.</p>}
        {info.previsao_retorno && <p className="text-xs text-muted-foreground" data-testid="previsao-os">Previsão de retorno: <span className="text-foreground">{dataHoraBR(info.previsao_retorno)}</span></p>}
        {(info.reagendamentos ?? 0) > 0 && <p className="text-xs text-muted-foreground">Agendamentos a pedido do cliente: {info.reagendamentos}</p>}
        {info.equipe && <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Users2 size={12} /> Equipe {info.equipe} · {info.compartilhado ? 'compartilhado com a equipe' : 'não compartilhado'}</p>}
        {info.afetados > 1 && <p className="text-xs text-amber-300" data-testid="afetados-portal">{info.afetados} pessoas afetadas (marcaram "também me afeta")</p>}
      </div>
      {!compacto && <TriagemPortal orderId={orderId} info={info} podeTriar={podeTriar} onMudou={() => { carregar(); onMudou?.() }} />}
      {info.preferencias && info.preferencias.length > 0 && (
        <div data-testid="preferencias-data">
          <p className="text-xs text-muted-foreground mb-1 inline-flex items-center gap-1.5"><Calendar size={12} /> Datas que o cliente pediu</p>
          <ul className="space-y-1">
            {info.preferencias.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                {dataBR(p.data)} — {ROTULO_PERIODO[p.periodo] ?? p.periodo}
                {onAgendar && <button type="button" onClick={() => onAgendar(`${p.data}T${(p.periodo === 'manha' ? info.janelas?.manha.inicio : p.periodo === 'tarde' ? info.janelas?.tarde.inicio : undefined) ?? HORA_PADRAO[p.periodo] ?? '09:00'}`)} data-testid="agendar-data-pedida" className="text-xs px-2 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10">Agendar nesta data</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {info.anexos.length > 0 && <div><p className="text-xs text-muted-foreground mb-1.5">Fotos e áudio do cliente</p><AnexosCliente anexos={info.anexos} /></div>}
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" data-testid="avisar-whatsapp" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white text-xs font-medium"><MessageCircle size={13} /> Avisar o cliente pelo WhatsApp</a>
      )}
      {!compacto && info.solicitante?.celular === null && <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Hand size={11} /> O cliente não informou celular.</p>}
    </div>
  )
}
