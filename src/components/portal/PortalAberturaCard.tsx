import { useEffect, useMemo, useState } from 'react'
import { Inbox, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useCategorias } from '@/hooks/useCatalogoSla'
import { Button } from '@/components/ui/button'
import { SecaoRecolhivel } from '@/components/ui/secao-recolhivel'
import { TIPOS_PORTAL } from '@/lib/grupos'

// Configurações › Abertura de chamados pelo portal (E4): quais tipos o cliente vê (e com que
// nome), se ele escolhe a prioridade (e o que cada nível significa) e os canais de aviso.
const PADRAO: Record<string, { rotulo: string; descricao: string }> = {
  incidente: { rotulo: 'Relatar um problema', descricao: 'Algo parou ou está com defeito' },
  requisicao: { rotulo: 'Fazer uma solicitação', descricao: 'Instalação, configuração, acesso ou troca' },
  visita: { rotulo: 'Solicitar visita técnica', descricao: 'Avaliação, vistoria ou orçamento' },
  preventiva: { rotulo: 'Agendar manutenção preventiva', descricao: 'Revisão planejada dos equipamentos' },
}
const NIVEIS: [string, string, string][] = [['critico', 'Crítico', 'Parou tudo: não consigo trabalhar'], ['alto', 'Alto', 'Está atrapalhando, mas consigo trabalhar'], ['baixo', 'Baixo', 'Pode esperar']]
const campo = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

export default function PortalAberturaCard() {
  const { tenant, refreshTenant } = useAuth()
  const { categorias } = useCategorias()
  const cfg: any = tenant?.portal_abertura ?? {}
  const [tipos, setTipos] = useState<Record<string, { ativo: boolean; rotulo: string; descricao: string }>>({})
  const [escolhe, setEscolhe] = useState(true)
  const [desc, setDesc] = useState<Record<string, string>>({})
  const [email, setEmail] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    const t: any = {}
    for (const k of Object.keys(PADRAO)) t[k] = { ativo: cfg.tipos?.[k]?.ativo ?? true, rotulo: cfg.tipos?.[k]?.rotulo ?? '', descricao: cfg.tipos?.[k]?.descricao ?? '' }
    setTipos(t)
    setEscolhe(cfg.prioridade?.solicitante_escolhe ?? true)
    setDesc({ critico: cfg.prioridade?.descricoes?.critico ?? '', alto: cfg.prioridade?.descricoes?.alto ?? '', baixo: cfg.prioridade?.descricoes?.baixo ?? '' })
    setEmail(cfg.canais?.email ?? true)
  }, [tenant?.portal_abertura]) // eslint-disable-line react-hooks/exhaustive-deps

  // quantas categorias aparecem no portal para cada tipo (o tipo aparece sempre que está ativo; sem categoria, o cliente abre sem assunto)
  const visiveis = useMemo(() => {
    const porId = new Map(categorias.map(c => [c.id, c]))
    const r: Record<string, number> = {}
    for (const k of Object.keys(PADRAO)) {
      r[k] = categorias.filter(c => {
        const pai = c.pai_id ? porId.get(c.pai_id) : null   // pai oculto esconde a filha
        return c.ativo && c.visivel_portal && c.tipos_portal.includes(k) && (!c.pai_id || (!!pai && pai.ativo && !!pai.visivel_portal))
      }).length
    }
    return r
  }, [categorias])
  const modoMatriz = tenant?.prioridade_modo === 'matriz'

  async function salvar() {
    setMsg(null); setSalvando(true)
    const { error } = await supabase.rpc('salvar_portal_abertura', { p: { tipos, prioridade: { solicitante_escolhe: escolhe, descricoes: desc }, canais: { email } } })
    setSalvando(false)
    if (error) { setMsg({ ok: false, texto: error.message }); return }
    await refreshTenant(); setMsg({ ok: true, texto: 'Salvo.' })
  }
  if (!tenant?.portal_habilitado) return null

  return (
    <SecaoRecolhivel id="portal-abertura" icone={<Inbox size={16} className="text-primary" />}
      titulo="Abertura de chamados pelo portal"
      descricao="O que os seus clientes podem pedir, como informam a prioridade e por onde recebem os avisos."
      resumo={`${Object.values(tipos).filter(t => t.ativo).length} tipos ativos`}>
      <div className="space-y-6" data-testid="portal-abertura-config">
        <div>
          <p className="text-xs font-medium mb-2">Tipos de chamado que o cliente vê</p>
          <div className="space-y-3">
            {TIPOS_PORTAL.map(({ value }) => (
              <div key={value} className="border border-border rounded-md p-3" data-tipo-config={value}>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={tipos[value]?.ativo ?? true} onChange={e => setTipos(t => ({ ...t, [value]: { ...t[value], ativo: e.target.checked } }))} data-testid={'tipo-ativo-' + value} />
                  <span className="text-foreground font-medium">{PADRAO[value].rotulo}</span>
                  <span className="text-[11px] text-muted-foreground">({visiveis[value] ?? 0} {(visiveis[value] ?? 0) === 1 ? 'assunto' : 'assuntos'} no portal)</span>
                </label>
                {(visiveis[value] ?? 0) === 0 && tipos[value]?.ativo && (
                  <p className="text-[11px] text-amber-300 mt-1 inline-flex items-start gap-1" data-aviso-tipo={value}><AlertTriangle size={11} className="mt-0.5 flex-shrink-0" /> Nenhuma categoria do catálogo aparece para este tipo: o cliente abre o chamado sem escolher assunto e ele cai na fila de entrada. Para pedir o assunto, marque categorias em Catálogo e SLA.</p>
                )}
                {tipos[value]?.ativo && (
                  <div className="grid sm:grid-cols-2 gap-2 mt-2">
                    <input aria-label={'Nome do tipo ' + value} value={tipos[value]?.rotulo ?? ''} maxLength={60} placeholder={PADRAO[value].rotulo} onChange={e => setTipos(t => ({ ...t, [value]: { ...t[value], rotulo: e.target.value } }))} className={campo} />
                    <input aria-label={'Descrição do tipo ' + value} value={tipos[value]?.descricao ?? ''} maxLength={140} placeholder={PADRAO[value].descricao} onChange={e => setTipos(t => ({ ...t, [value]: { ...t[value], descricao: e.target.value } }))} className={campo} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Deixe o nome em branco para usar o padrão. Pelo menos um tipo precisa ficar ativo.</p>
        </div>

        <div>
          <p className="text-xs font-medium mb-2">Prioridade de um problema (Incidente)</p>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={escolhe} onChange={e => setEscolhe(e.target.checked)} className="mt-0.5" data-testid="solicitante-escolhe" />
            <span className="text-foreground">O cliente informa a prioridade<span className="block text-[11px] text-muted-foreground">O atendimento confirma ou ajusta, explicando o motivo. Desligado, o chamado entra sem prioridade informada e o atendimento classifica.</span></span>
          </label>
          {escolhe && (modoMatriz ? (
            <p className="text-[11px] text-muted-foreground mt-2" data-testid="modo-matriz-info">A sua empresa usa a matriz Impacto × Urgência: o cliente responde duas perguntas simples ("Quem é afetado?" e "Quanto atrapalha?") e a prioridade sai da matriz de Catálogo e SLA.</p>
          ) : (
            <div className="grid gap-2 mt-3" data-testid="descricoes-niveis">
              {NIVEIS.map(([k, r, padrao]) => (
                <div key={k} className="grid sm:grid-cols-[110px_1fr] gap-2 items-center"><span className="text-sm text-foreground">{r}</span>
                  <input aria-label={'Descrição do nível ' + r} value={desc[k] ?? ''} maxLength={140} placeholder={padrao} onChange={e => setDesc(d => ({ ...d, [k]: e.target.value }))} className={campo} /></div>
              ))}
              <p className="text-[11px] text-muted-foreground">É o que o cliente lê ao escolher a gravidade.</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-medium mb-2">Avisos ao cliente</p>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} className="mt-0.5" data-testid="canal-email" />
            <span className="text-foreground">Avisar por e-mail<span className="block text-[11px] text-muted-foreground">Abertura, agendamento, atendimento e conclusão — só para quem aceitou receber comunicações. O cliente escolhe nas preferências dele. Desligado, ele vê que a empresa não disponibiliza este canal.</span></span>
          </label>
          <p className="text-[11px] text-muted-foreground mt-2">Avisos pelo WhatsApp ficam disponíveis quando a conexão de WhatsApp estiver ativa.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="cta" size="sm" loading={salvando} onClick={salvar} data-testid="salvar-abertura">Salvar</Button>
          {msg && <p className={'text-xs ' + (msg.ok ? 'text-green-400' : 'text-red-400')} role="status">{msg.texto}</p>}
        </div>
      </div>
    </SecaoRecolhivel>
  )
}
