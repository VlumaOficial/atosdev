import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, Image as ImageIcon, Mic, Square, X, Loader2, AlertTriangle, CheckCircle2, MessageCircle, Hand, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { linkWhatsApp, type PortalContexto } from '@/lib/portal'
import { MAX_ANEXOS, MAX_AUDIO_SEG, prepararFoto, prepararAudio, enviarAnexos, dataBR, type AnexoLocal, type ConfigAgendamento } from '@/lib/portalChamados'
import OpcoesDatas from './OpcoesDatas'
import { useSearchParams } from 'react-router-dom'
import { ROTULO_NIVEL } from '@/lib/sla'
import { usePortal } from './PortalContext'
import PortalPagina from './PortalPagina'
import StatusChamado from './StatusChamado'
import { cn } from '@/lib/utils'

// Abrir chamado (E4): o cliente escolhe o que quer fazer, o assunto e a unidade, descreve,
// anexa fotos/áudio e informa a prioridade (ou as datas que prefere). A OS nasce no grupo
// do catálogo; o atendimento confirma ou ajusta a classificação.

interface Cfg {
  perfil: string
  tipos: { value: string; rotulo: string; descricao: string }[]
  categorias: { id: string; nome: string; pai: string | null; descricao: string | null; tipos: string[] }[]
  prioridade: { modo: 'matriz' | 'simples'; matriz: Record<string, Record<string, string>>; solicitante_escolhe: boolean; descricoes: Record<string, string> }
  unidades: { id: string; nome: string }[]
  equipes: { id: string; nome: string; unidades: string[] }[]
  contatos: { whatsapp?: string } | null
  agendamento: ConfigAgendamento
}
const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
const IMPACTOS = [['baixo', 'Só eu'], ['medio', 'Meu setor'], ['alto', 'A empresa toda']] as const
const URGENCIAS = [['baixa', 'Pode esperar'], ['media', 'Atrapalha o trabalho'], ['alta', 'Parou tudo']] as const

export default function PortalAbrir() { return <PortalPagina>{(ctx, sessao) => <Formulario ctx={ctx} userId={sessao.user.id} />}</PortalPagina> }

function Formulario({ ctx, userId }: { ctx: PortalContexto; userId: string }) {
  const { id, base } = usePortal()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const relacionado = params.get('relacionado')   // novo chamado ligado a um chamado já fechado (E5c)
  const [origem, setOrigem] = useState<{ numero: string; client_id: string } | null>(null)
  const clientes = ctx.vinculos ?? []
  const [clientId, setClientId] = useState(clientes[0]?.client_id ?? '')
  const [cfg, setCfg] = useState<Cfg | null>(null)
  useEffect(() => {
    if (!relacionado) return
    supabase.rpc('portal_obter_chamado', { p_order: relacionado }).then(({ data }) => {
      const d = data as { numero: string; client_id: string } | null
      if (d) { setOrigem({ numero: d.numero, client_id: d.client_id }); setClientId(d.client_id) }
    })
  }, [relacionado])
  const [erroCfg, setErroCfg] = useState('')
  const [tipo, setTipo] = useState('')
  const [cat, setCat] = useState('')
  const [loc, setLoc] = useState('')
  const [equipe, setEquipe] = useState('')
  const [compart, setCompart] = useState(true)
  const [titulo, setTitulo] = useState('')
  const [desc, setDesc] = useState('')
  const [nivel, setNivel] = useState('')
  const [imp, setImp] = useState('')
  const [urg, setUrg] = useState('')
  const [prefs, setPrefs] = useState<{ data: string; periodo: string }[]>([{ data: '', periodo: 'qualquer' }])
  const [avisosData, setAvisosData] = useState<Record<number, string | null>>({})
  const [anexos, setAnexos] = useState<AnexoLocal[]>([])
  const [parecidos, setParecidos] = useState<any[]>([])
  const [ignorouParecidos, setIgnorouParecidos] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<{ id: string; numero: string } | null>(null)

  // configuração do cliente escolhido
  useEffect(() => {
    if (!clientId) return
    setCfg(null); setErroCfg(''); setTipo(''); setCat(''); setLoc(''); setEquipe('')
    supabase.rpc('portal_abertura_config', { p_client: clientId }).then(({ data, error }) => {
      if (error) { setErroCfg('Não foi possível carregar as opções.'); return }
      const c = data as Cfg; setCfg(c)
      if (c.equipes.length === 1) setEquipe(c.equipes[0].id)
      if (c.tipos.length === 1) setTipo(c.tipos[0].value)
    })
  }, [clientId])

  const categorias = useMemo(() => (cfg?.categorias ?? []).filter(c => c.tipos.includes(tipo)), [cfg, tipo])
  const unidades = useMemo(() => {
    const eq = cfg?.equipes.find(e => e.id === equipe)
    const lista = cfg?.unidades ?? []
    return eq && eq.unidades.length ? lista.filter(u => eq.unidades.includes(u.id)) : lista
  }, [cfg, equipe])
  const precisaData = tipo !== '' && tipo !== 'incidente'
  const escolhePrioridade = tipo === 'incidente' && !!cfg?.prioridade.solicitante_escolhe
  const categoriaSel = categorias.find(c => c.id === cat)
  const prioridadeCalculada = cfg && imp && urg ? cfg.prioridade.matriz?.[imp]?.[urg] : undefined

  useEffect(() => { setCat(''); setParecidos([]); setIgnorouParecidos(false) }, [tipo])
  useEffect(() => { if (loc && !unidades.some(u => u.id === loc)) setLoc('') }, [unidades, loc])
  // aviso de chamado parecido (mesma unidade e assunto)
  useEffect(() => {
    setParecidos([]); setIgnorouParecidos(false)
    if (tipo !== 'incidente' || !cat || !loc || !clientId) return
    supabase.rpc('portal_chamados_parecidos', { p_client: clientId, p_location: loc, p_categoria: cat }).then(({ data }) => setParecidos((data as any[]) ?? []))
  }, [tipo, cat, loc, clientId])
  // calendário da unidade para cada data pedida
  useEffect(() => {
    prefs.forEach((p, i) => {
      if (!p.data || !clientId) { setAvisosData(a => ({ ...a, [i]: null })); return }
      supabase.rpc('portal_avisos_data', { p_client: clientId, p_location: loc || null, p_data: p.data }).then(({ data }) => setAvisosData(a => ({ ...a, [i]: (data as string) ?? null })))
    })
  }, [prefs, loc, clientId])

  const nAudio = anexos.filter(a => a.tipo === 'audio').length

  async function tambemAfeta(oid: string) {
    const { error } = await supabase.rpc('portal_tambem_afeta', { p_order: oid })
    if (!error) navigate(`${base}/chamados/${oid}`)
  }

  async function enviar() {
    setErro('')
    if (!tipo) { setErro('Escolha o que você quer fazer.'); return }
    if (categorias.length > 0 && !cat) { setErro('Escolha o assunto.'); return }
    if (titulo.trim().length < 3) { setErro('Dê um título ao chamado (mínimo 3 letras).'); return }
    if (desc.trim().length < 10) { setErro('Descreva o que está acontecendo (mínimo 10 letras).'); return }
    if (escolhePrioridade) {
      if (cfg!.prioridade.modo === 'matriz' && (!imp || !urg)) { setErro('Responda às duas perguntas sobre o problema.'); return }
      if (cfg!.prioridade.modo === 'simples' && !nivel) { setErro('Escolha a prioridade.'); return }
    }
    if (cfg!.equipes.length > 1 && !equipe) { setErro('Escolha a equipe em nome da qual você está abrindo o chamado.'); return }
    const preferencias = precisaData ? prefs.filter(p => p.data) : []
    setEnviando(true)
    try {
      const up = anexos.length ? await enviarAnexos(id.tenant_id, clientId, userId, anexos) : []
      const { data, error } = await supabase.rpc('portal_abrir_chamado', { p: {
        client_id: clientId, tipo, categoria_id: cat || null, location_id: loc || null, titulo: titulo.trim(), descricao: desc.trim(),
        relacionada_a: relacionado && origem ? relacionado : null, equipe_id: equipe || null, compartilhado: compart, nivel: nivel || null, impacto: imp || null, urgencia: urg || null, preferencias, anexos: up,
      } })
      if (error) {
        if (up.length) await supabase.storage.from('portal-anexos').remove(up.map(x => x.path))
        throw new Error(error.message)
      }
      setFeito({ id: (data as any).id, numero: (data as any).numero })
    } catch (e) {
      setErro((e as Error).message)
    } finally { setEnviando(false) }
  }

  if (feito) {
    const wa = linkWhatsApp(cfg?.contatos?.whatsapp, `Olá, ${id.empresa}! Abri o chamado ${feito.numero} pelo portal.`)
    return (
      <div className="text-center py-6" data-testid="chamado-registrado">
        <CheckCircle2 size={44} className="text-green-400 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-foreground">Chamado registrado</h1>
        <p className="text-sm text-muted-foreground mt-2">Seu chamado é o <b className="text-foreground" data-testid="numero-novo">{feito.numero}</b>. A {id.empresa.replace(/\.$/, '')} vai analisá-lo; você acompanha a situação aqui no portal.</p>
        <div className="flex flex-wrap gap-2 justify-center mt-5">
          <Link to={`${base}/chamados/${feito.id}`} className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium">Ver o chamado</Link>
          <button onClick={() => { setFeito(null); setTitulo(''); setDesc(''); setCat(''); setAnexos([]); setImp(''); setUrg(''); setNivel(''); setPrefs([{ data: '', periodo: 'qualquer' }]) }} className="px-4 py-2.5 rounded-md border border-border text-sm text-foreground">Abrir outro</button>
          {wa && <a href={wa} target="_blank" rel="noreferrer" data-testid="wa-novo" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-green-600 text-white text-sm font-medium"><MessageCircle size={15} /> Falar pelo WhatsApp</a>}
        </div>
      </div>
    )
  }

  return (
    <div data-testid="portal-abrir">
      {origem && <p className="text-sm text-primary bg-primary/10 border border-primary/30 rounded-md px-3 py-2 mb-4" data-testid="banner-relacionado">Novo chamado relacionado a <b className="font-mono">{origem.numero}</b>.</p>}
      <h1 className="text-xl font-bold text-foreground">Abrir chamado</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-5">Conte o que precisa; levamos menos de um minuto.</p>

      {clientes.length > 1 && (
        <div className="mb-5">
          <label htmlFor="ab-cliente" className="block text-sm font-medium text-foreground mb-1.5">Abrindo chamado para</label>
          <select id="ab-cliente" value={clientId} onChange={e => setClientId(e.target.value)} className={campo}>
            {clientes.map(v => <option key={v.client_id} value={v.client_id}>{v.cliente}</option>)}
          </select>
        </div>
      )}

      {erroCfg ? <p className="text-sm text-red-400">{erroCfg}</p> : !cfg ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div> : cfg.tipos.length === 0 ? (
        <p className="text-sm text-muted-foreground vluma-card p-5" data-testid="sem-tipos">A abertura de chamados pelo portal ainda não está disponível. Fale com a {id.empresa.replace(/\.$/, '')} pelos contatos do portal.</p>
      ) : (
        <div className="space-y-6">
          {/* 1. o que você quer fazer */}
          <section>
            <p className="text-sm font-medium text-foreground mb-2">O que você quer fazer?</p>
            <div className="grid gap-2" role="radiogroup" aria-label="Tipo de chamado">
              {cfg.tipos.map(t => (
                <button key={t.value} type="button" role="radio" aria-checked={tipo === t.value} onClick={() => setTipo(t.value)} data-tipo={t.value}
                  className={cn('text-left p-3.5 rounded-lg border transition', tipo === t.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}>
                  <p className="text-sm font-medium text-foreground">{t.rotulo}</p><p className="text-xs text-muted-foreground mt-0.5">{t.descricao}</p>
                </button>
              ))}
            </div>
          </section>

          {tipo && (<>
            {/* 2. assunto e unidade */}
            <section className="space-y-4">
              {cfg.equipes.length > 1 && (
                <div><label htmlFor="ab-equipe" className="block text-sm font-medium text-foreground mb-1.5">Em nome da equipe</label>
                  <select id="ab-equipe" value={equipe} onChange={e => setEquipe(e.target.value)} className={campo}><option value="">Escolha…</option>{cfg.equipes.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
              )}
              {categorias.length > 0 && <div>
                <label htmlFor="ab-assunto" className="block text-sm font-medium text-foreground mb-1.5">Assunto *</label>
                <select id="ab-assunto" value={cat} onChange={e => setCat(e.target.value)} className={campo}>
                  <option value="">Escolha o assunto…</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.pai ? `${c.pai} › ${c.nome}` : c.nome}</option>)}
                </select>
                {categoriaSel?.descricao && <p className="text-xs text-muted-foreground mt-1" data-testid="descricao-assunto">{categoriaSel.descricao}</p>}
              </div>}
              {unidades.length > 0 && (
                <div><label htmlFor="ab-unidade" className="block text-sm font-medium text-foreground mb-1.5">Unidade</label>
                  <select id="ab-unidade" value={loc} onChange={e => setLoc(e.target.value)} className={campo}><option value="">{unidades.length > 1 ? 'Escolha a unidade…' : 'Selecione…'}</option>{unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
              )}
            </section>

            {/* aviso de chamado parecido */}
            {parecidos.length > 0 && !ignorouParecidos && (
              <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4" data-testid="aviso-parecidos">
                <p className="text-sm font-medium text-foreground inline-flex items-center gap-2"><AlertTriangle size={15} className="text-amber-400" /> Já existe um chamado aberto sobre isto nesta unidade</p>
                <ul className="mt-2 space-y-2">
                  {parecidos.map(p => (
                    <li key={p.id} className="rounded-md border border-border bg-card p-3" data-parecido={p.numero}>
                      <div className="flex items-center justify-between gap-2"><span className="text-xs font-mono text-primary">{p.numero}</span><StatusChamado status={p.status} /></div>
                      <p className="text-sm text-foreground mt-1">{p.titulo}</p>
                      <p className="text-[11px] text-muted-foreground">Aberto em {dataBR(p.criado_em)} · {p.afetados} {p.afetados === 1 ? 'pessoa afetada' : 'pessoas afetadas'}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {p.meu ? <Link to={`${base}/chamados/${p.id}`} className="text-xs px-3 py-1.5 rounded-md border border-border text-foreground">Ver o chamado</Link>
                          : <button onClick={() => tambemAfeta(p.id)} data-testid="parecido-tambem-afeta" className="text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary inline-flex items-center gap-1"><Hand size={12} /> É o mesmo problema — também me afeta</button>}
                      </div>
                    </li>
                  ))}
                </ul>
                <button onClick={() => setIgnorouParecidos(true)} data-testid="outro-problema" className="mt-3 text-xs text-muted-foreground hover:text-foreground underline">É outro problema, continuar</button>
              </section>
            )}

            {/* 3. descrição */}
            {(parecidos.length === 0 || ignorouParecidos) && (<>
              <section className="space-y-4">
                <div><label htmlFor="ab-titulo" className="block text-sm font-medium text-foreground mb-1.5">Título *</label>
                  <input id="ab-titulo" value={titulo} maxLength={120} onChange={e => setTitulo(e.target.value)} placeholder="Resuma em poucas palavras" className={campo} /></div>
                <div><label htmlFor="ab-desc" className="block text-sm font-medium text-foreground mb-1.5">O que está acontecendo? *</label>
                  <textarea id="ab-desc" rows={4} maxLength={4000} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Quanto mais detalhes, mais rápido conseguimos ajudar" className={campo + ' resize-none'} /></div>
                <Anexos anexos={anexos} setAnexos={setAnexos} nAudio={nAudio} />
              </section>

              {/* 4. prioridade ou datas */}
              {escolhePrioridade && (
                <section data-testid="bloco-prioridade">
                  {cfg.prioridade.modo === 'simples' ? (
                    <>
                      <p className="text-sm font-medium text-foreground mb-2">Qual a gravidade? *</p>
                      <div className="grid gap-2" role="radiogroup">
                        {(['critico', 'alto', 'baixo'] as const).map(n => (
                          <button key={n} type="button" role="radio" aria-checked={nivel === n} onClick={() => setNivel(n)} data-nivel={n}
                            className={cn('text-left p-3 rounded-lg border', nivel === n ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}>
                            <p className="text-sm font-medium text-foreground">{ROTULO_NIVEL[n]}</p><p className="text-xs text-muted-foreground">{cfg.prioridade.descricoes[n]}</p>
                          </button>))}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div><p className="text-sm font-medium text-foreground mb-2">Quem está sendo afetado? *</p>
                        <div className="grid grid-cols-3 gap-2" role="radiogroup">{IMPACTOS.map(([v, r]) => <button key={v} type="button" role="radio" aria-checked={imp === v} onClick={() => setImp(v)} data-impacto={v} className={cn('p-2.5 rounded-lg border text-sm', imp === v ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40')}>{r}</button>)}</div></div>
                      <div><p className="text-sm font-medium text-foreground mb-2">Quanto isso atrapalha? *</p>
                        <div className="grid grid-cols-3 gap-2" role="radiogroup">{URGENCIAS.map(([v, r]) => <button key={v} type="button" role="radio" aria-checked={urg === v} onClick={() => setUrg(v)} data-urgencia={v} className={cn('p-2.5 rounded-lg border text-sm', urg === v ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40')}>{r}</button>)}</div></div>
                      {prioridadeCalculada && <p className="text-sm text-foreground" data-testid="prioridade-calculada">Prioridade do seu chamado: <b>{ROTULO_NIVEL[prioridadeCalculada] ?? prioridadeCalculada}</b></p>}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-2">O atendimento confirma a prioridade e pode ajustá-la, explicando o motivo.</p>
                </section>
              )}

              {precisaData && (
                <section data-testid="bloco-datas">
                  <p className="text-sm font-medium text-foreground mb-1 inline-flex items-center gap-1.5"><Calendar size={14} /> Quando prefere o atendimento? <span className="font-normal text-muted-foreground">(até 3 opções)</span></p>
                  <OpcoesDatas opcoes={prefs} setOpcoes={setPrefs} config={cfg.agendamento} avisos={avisosData} />
                  <p className="text-[11px] text-muted-foreground mt-1">O atendimento confirma uma das datas.</p>
                </section>
              )}

              {cfg.equipes.length > 0 && (
                <label className="flex items-start gap-2 text-sm cursor-pointer"><input type="checkbox" checked={compart} onChange={e => setCompart(e.target.checked)} className="mt-0.5" data-testid="compartilhar" />
                  <span className="text-foreground">Compartilhar com a minha equipe <span className="block text-xs text-muted-foreground">Desmarcado, só você e o Supervisor veem este chamado.</span></span></label>
              )}

              {erro && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2" role="alert" data-testid="erro-abrir">{erro}</p>}
              <button onClick={enviar} disabled={enviando} data-testid="enviar-chamado"
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {enviando && <Loader2 size={16} className="animate-spin" />} {enviando ? 'Enviando…' : 'Enviar chamado'}
              </button>
            </>)}
          </>)}
        </div>
      )}
    </div>
  )
}

// ---------- fotos e áudio ----------
function Anexos({ anexos, setAnexos, nAudio }: { anexos: AnexoLocal[]; setAnexos: React.Dispatch<React.SetStateAction<AnexoLocal[]>>; nAudio: number }) {
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [gravando, setGravando] = useState(false)
  const [seg, setSeg] = useState(0)
  const rec = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])
  const timer = useRef<number | null>(null)
  const cheio = anexos.length >= MAX_ANEXOS

  async function fotos(files: FileList | null) {
    setMsg('')
    if (!files) return
    for (const f of Array.from(files)) {
      if (anexos.length + 1 > MAX_ANEXOS) { setMsg(`No máximo ${MAX_ANEXOS} arquivos por chamado.`); break }
      try { const a = await prepararFoto(f); setAnexos(l => l.length < MAX_ANEXOS ? [...l, a] : l) } catch (e) { setMsg((e as Error).message) }
    }
    if (camera.current) camera.current.value = ''; if (galeria.current) galeria.current.value = ''
  }
  async function gravar() {
    setMsg('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setMsg('Seu navegador não permite gravar áudio aqui. Descreva por texto ou envie uma foto.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m))
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      pedacos.current = []
      r.ondataavailable = e => { if (e.data.size) pedacos.current.push(e.data) }
      r.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        if (timer.current) window.clearInterval(timer.current)
        const blob = new Blob(pedacos.current, { type: r.mimeType || mime || 'audio/webm' })
        setGravando(false)
        if (blob.size > 0) setAnexos(l => l.length < MAX_ANEXOS ? [...l, prepararAudio(blob, 'audio-do-cliente')] : l)
      }
      rec.current = r; r.start(); setGravando(true); setSeg(0)
      timer.current = window.setInterval(() => setSeg(s => { if (s + 1 >= MAX_AUDIO_SEG) { r.stop(); return s } return s + 1 }), 1000)
    } catch { setMsg('Não foi possível acessar o microfone. Permita o uso do microfone no navegador.') }
  }
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); try { rec.current?.stream.getTracks().forEach(t => t.stop()) } catch { /* já parado */ } }, [])

  return (
    <div data-testid="anexos-editor">
      <p className="text-sm font-medium text-foreground mb-2">Fotos e áudio <span className="font-normal text-muted-foreground">(opcional — ajuda o técnico a levar o que precisa)</span></p>
      <div className="flex flex-wrap gap-2">
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => fotos(e.target.files)} data-testid="input-camera" />
        <input ref={galeria} type="file" accept="image/*" multiple className="hidden" onChange={e => fotos(e.target.files)} data-testid="input-galeria" />
        <button type="button" disabled={cheio} onClick={() => camera.current?.click()} className="px-3 py-2 rounded-md border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><Camera size={14} /> Tirar foto</button>
        <button type="button" disabled={cheio} onClick={() => galeria.current?.click()} className="px-3 py-2 rounded-md border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><ImageIcon size={14} /> Escolher foto</button>
        {gravando
          ? <button type="button" onClick={() => rec.current?.stop()} data-testid="parar-audio" className="px-3 py-2 rounded-md bg-red-500/15 border border-red-500/40 text-red-300 text-sm inline-flex items-center gap-1.5"><Square size={13} /> Parar ({seg}s)</button>
          : <button type="button" disabled={cheio || nAudio >= 1} onClick={gravar} data-testid="gravar-audio" className="px-3 py-2 rounded-md border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><Mic size={14} /> Gravar áudio</button>}
      </div>
      {msg && <p className="text-xs text-amber-300 mt-2" role="alert">{msg}</p>}
      {anexos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2" data-testid="anexos-lista">
          {anexos.map(a => (
            <li key={a.id} className="relative rounded-md border border-border overflow-hidden bg-secondary/40" data-anexo-local={a.tipo}>
              {a.tipo === 'foto' ? <img src={a.url} alt={a.nome} className="w-full aspect-square object-cover" /> : <div className="aspect-square flex flex-col items-center justify-center gap-1 p-1"><Mic size={20} className="text-muted-foreground" /><audio controls src={a.url} className="w-full" /></div>}
              <button type="button" aria-label="Remover anexo" onClick={() => { URL.revokeObjectURL(a.url); setAnexos(l => l.filter(x => x.id !== a.id)) }} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
