import { useCallback, useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { Loader2, LogOut, ShieldCheck, Building2, ChevronDown, Ticket } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { PortalContexto, TermoPendente } from '@/lib/portal'
import { usePortal } from './PortalContext'
import { MarcaPortal, RodapePortal, AvisoPrevia, ContatosEmpresa } from './PortalLayout'

// Porta de entrada do portal depois do login: confere o vínculo com a
// empresa, pede o aceite dos termos pendentes e mostra o início.
export default function PortalInicio() {
  const { id } = usePortal()
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [ctx, setCtx] = useState<PortalContexto | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => subscription.unsubscribe()
  }, [])

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('portal_meu_contexto', { p_tenant: id.tenant_id })
    if (error) { setErro('Não foi possível carregar o portal. Tente de novo.'); return }
    setCtx(data as PortalContexto)
  }, [id.tenant_id])

  useEffect(() => { if (sessao) carregar() }, [sessao, carregar])

  // registra o acesso uma vez por sessão do navegador
  useEffect(() => {
    if (!ctx?.acesso || (ctx.termos_pendentes?.length ?? 0) > 0) return
    const chave = 'atos_portal_acesso_' + id.tenant_id
    try { if (sessionStorage.getItem(chave)) return; sessionStorage.setItem(chave, '1') } catch { /* sem storage: registra de novo */ }
    // o cliente do Supabase só dispara a chamada quando o resultado é lido
    supabase.rpc('portal_registrar_acesso', { p_tenant: id.tenant_id }).then(() => undefined)
  }, [ctx, id.tenant_id])

  if (sessao === undefined) return <Carregando />
  if (!sessao) return <Navigate to="entrar" replace />
  if (erro) return <Centro><p className="text-sm text-red-400">{erro}</p></Centro>
  if (!ctx) return <Carregando />
  if (!ctx.acesso) return ctx.interno ? <PreviaInterna /> : <SemAcesso />
  if ((ctx.termos_pendentes?.length ?? 0) > 0) return <AceiteTermos termos={ctx.termos_pendentes!} onPronto={carregar} />
  return <Inicio ctx={ctx} />
}

function Carregando() {
  return <Centro><Loader2 className="animate-spin text-muted-foreground" /></Centro>
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center px-4">{children}</div>
}

async function sair() {
  await supabase.auth.signOut()
}

function Topo() {
  return (
    <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10">
      <AvisoPrevia />
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <MarcaPortal />
        <button onClick={sair} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5" data-testid="portal-sair">
          <LogOut size={15} /> Sair
        </button>
      </div>
    </header>
  )
}

function SemAcesso() {
  const { id } = usePortal()
  return (
    <Centro>
      <div className="max-w-sm text-center" data-testid="portal-sem-acesso">
        <div className="flex justify-center mb-6"><MarcaPortal grande /></div>
        <h1 className="text-lg font-bold">Sua conta não tem acesso a este portal</h1>
        <p className="text-sm text-muted-foreground mt-2">Se você é cliente da {id.empresa}, peça o acesso ao responsável da sua empresa ou fale com a {id.empresa}:</p>
        <div className="mt-4 flex justify-center"><ContatosEmpresa /></div>
        <button onClick={sair} className="mt-6 text-sm text-primary hover:underline">Entrar com outra conta</button>
      </div>
    </Centro>
  )
}

// Equipe interna da empresa abrindo o portal (ex.: o admin conferindo a
// identidade antes de ativar): mostra como o cliente vê, sem dados
function PreviaInterna() {
  const { id } = usePortal()
  return (
    <div className="min-h-screen">
      <Topo />
      <main className="max-w-3xl mx-auto px-4 py-8" data-testid="portal-previa-interna">
        <div className="vluma-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Você entrou com uma conta da equipe interna</p>
          <h1 className="text-lg font-bold mt-1">É assim que seus clientes veem o portal</h1>
          <p className="text-sm text-muted-foreground mt-2">Marca, cores, boas-vindas e contatos abaixo são os configurados em Configurações › Portal de atendimento. Para usar o portal como cliente, saia e entre com uma conta do portal.</p>
        </div>
        <div className="vluma-card p-5 mt-4">
          <MarcaPortal grande />
          {id.boas_vindas && <p className="text-sm text-foreground/90 mt-4 whitespace-pre-line">{id.boas_vindas}</p>}
          <div className="mt-4"><ContatosEmpresa /></div>
          <button disabled className="mt-5 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium opacity-90 cursor-default">Botão na cor da empresa</button>
        </div>
      </main>
      <RodapePortal />
    </div>
  )
}

function AceiteTermos({ termos, onPronto }: { termos: TermoPendente[]; onPronto: () => void }) {
  const { id } = usePortal()
  const obrigatorios = termos.filter(t => t.tipo !== 'comunicacao')
  const comunicacao = termos.find(t => t.tipo === 'comunicacao')
  const [aceitoObrig, setAceitoObrig] = useState(false)
  const [aceitoCom, setAceitoCom] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    setErro('')
    setEnviando(true)
    const aceitos = [...obrigatorios.map(t => t.id), ...(comunicacao && aceitoCom ? [comunicacao.id] : [])]
    const recusados = comunicacao && !aceitoCom ? [comunicacao.id] : []
    const { error } = await supabase.rpc('portal_aceitar_termos', { p_tenant: id.tenant_id, p_aceitos: aceitos, p_recusados: recusados })
    setEnviando(false)
    if (error) { setErro(error.message); return }
    onPronto()
  }

  function Termo({ t }: { t: TermoPendente }) {
    const ab = aberto === t.id
    return (
      <div className="border border-border rounded-md">
        <button type="button" onClick={() => setAberto(ab ? null : t.id)} aria-expanded={ab}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground">
          <span>{t.titulo} <span className="text-xs font-normal text-muted-foreground">· versão {t.versao}</span></span>
          <ChevronDown size={16} className={'text-muted-foreground transition-transform ' + (ab ? 'rotate-180' : '')} />
        </button>
        {ab && (
          <div className="px-3 pb-3 max-h-72 overflow-y-auto text-sm text-foreground/85 leading-relaxed" data-testid={'termo-texto-' + t.tipo}>
            {t.texto.split(/\n{2,}/).map((p, i) => <p key={i} className="mb-2 whitespace-pre-line">{p}</p>)}
          </div>
        )}
      </div>
    )
  }

  const pode = obrigatorios.length === 0 || aceitoObrig
  return (
    <div className="min-h-screen">
      <Topo />
      <main className="max-w-xl mx-auto px-4 py-8" data-testid="portal-aceite">
        <div className="flex items-center gap-2 mb-1"><ShieldCheck size={18} className="text-primary" /><h1 className="text-lg font-bold">Antes de começar</h1></div>
        <p className="text-sm text-muted-foreground mb-5">
          {termos.some(t => t.versao > 1) ? 'Os termos foram atualizados. ' : ''}Leia e confirme para usar o portal da {id.empresa}.
        </p>
        {obrigatorios.length > 0 && (
          <div className="space-y-2">
            {obrigatorios.map(t => <Termo key={t.id} t={t} />)}
            <label className="flex items-start gap-2 pt-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={aceitoObrig} onChange={e => setAceitoObrig(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" data-testid="aceite-obrigatorio" />
              <span>Li e aceito {obrigatorios.length > 1 ? 'os termos de uso e o aviso de privacidade' : obrigatorios[0].titulo.toLowerCase()}.</span>
            </label>
          </div>
        )}
        {comunicacao && (
          <div className="space-y-2 mt-6">
            <Termo t={comunicacao} />
            <label className="flex items-start gap-2 pt-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={aceitoCom} onChange={e => setAceitoCom(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" data-testid="aceite-comunicacao" />
              <span>Quero receber avisos dos meus chamados por e-mail e WhatsApp. <span className="text-muted-foreground">(opcional — sem isso, você acompanha tudo pelo portal)</span></span>
            </label>
          </div>
        )}
        {erro && <p className="text-sm text-red-400 mt-4" role="alert">{erro}</p>}
        <button onClick={confirmar} disabled={!pode || enviando} data-testid="aceite-confirmar"
          className="mt-6 w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {enviando && <Loader2 size={15} className="animate-spin" />} Continuar
        </button>
        <button onClick={sair} className="mt-3 w-full text-sm text-muted-foreground hover:text-foreground">Sair</button>
      </main>
    </div>
  )
}

function Inicio({ ctx }: { ctx: PortalContexto }) {
  const { id, base } = usePortal()
  const primeiroNome = (ctx.pessoa?.nome ?? '').split(' ')[0]
  return (
    <div className="min-h-screen">
      <Topo />
      <main className="max-w-3xl mx-auto px-4 py-8" data-testid="portal-inicio">
        <h1 className="text-xl font-bold text-foreground">Olá, {primeiroNome}!</h1>
        {id.boas_vindas && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{id.boas_vindas}</p>}

        <div className="vluma-card p-5 mt-6 flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0"><Ticket size={18} className="text-primary" /></div>
          <div>
            <p className="text-sm font-medium text-foreground">Chamados</p>
            <p className="text-sm text-muted-foreground mt-0.5">A abertura e o acompanhamento de chamados por aqui chegam na próxima etapa. Enquanto isso, fale com a {id.empresa} pelos contatos abaixo.</p>
          </div>
        </div>

        <div className="vluma-card p-5 mt-4">
          <p className="text-sm font-medium text-foreground mb-3">Seu acesso</p>
          <ul className="space-y-2" data-testid="portal-vinculos">
            {(ctx.vinculos ?? []).map(v => (
              <li key={v.client_id} className="flex items-center gap-2 text-sm">
                <Building2 size={15} className="text-muted-foreground" />
                <span className="text-foreground">{v.cliente}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{v.perfil === 'supervisor' ? 'Supervisor' : 'Usuário'}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-3">{ctx.pessoa?.email}</p>
        </div>

        <div className="vluma-card p-5 mt-4">
          <p className="text-sm font-medium text-foreground mb-3">Fale com a {id.empresa}</p>
          <ContatosEmpresa />
          {!id.contatos || Object.keys(id.contatos).length === 0 ? <p className="text-sm text-muted-foreground">Contatos ainda não informados.</p> : null}
        </div>
        <p className="text-center mt-6"><Link to={`${base}/termos/privacidade`} className="text-xs text-muted-foreground hover:underline">Como tratamos seus dados</Link></p>
      </main>
      <RodapePortal />
    </div>
  )
}
