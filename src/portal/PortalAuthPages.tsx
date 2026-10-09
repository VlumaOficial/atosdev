import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePortal } from './PortalContext'
import { MarcaPortal, RodapePortal, AvisoPrevia } from './PortalLayout'

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AvisoPrevia />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center"><MarcaPortal grande /></div>
          {children}
          <RodapePortal />
        </div>
      </div>
    </div>
  )
}

const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
const botao = 'w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2'

export function PortalEntrar() {
  const { id, base } = usePortal()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) {
      setErro(/rate|many/i.test(error.message)
        ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
        : 'E-mail ou senha incorretos. Verifique seus dados.')
      return
    }
    navigate(base || '/', { replace: true })
  }

  return (
    <Moldura>
      <h1 className="text-xl font-bold text-foreground text-center">Entrar</h1>
      <p className="text-sm text-muted-foreground text-center mt-1 mb-6">
        {id.boas_vindas || `Acompanhe seus chamados com a ${id.empresa}.`}
      </p>
      <form onSubmit={entrar} className="space-y-4" data-testid="portal-entrar">
        <div>
          <label htmlFor="portal-email" className="block text-sm font-medium mb-1.5">E-mail</label>
          <input id="portal-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className={campo} />
        </div>
        <div>
          <label htmlFor="portal-senha" className="block text-sm font-medium mb-1.5">Senha</label>
          <div className="relative">
            <input id="portal-senha" type={ver ? 'text' : 'password'} autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} className={campo + ' pr-10'} />
            <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
              {ver ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
        <button type="submit" disabled={enviando} className={botao}>
          {enviando && <Loader2 size={15} className="animate-spin" />} Entrar
        </button>
        <p className="text-center">
          <Link to={`${base}/esqueci-senha`} className="text-sm text-primary hover:underline">Esqueci minha senha</Link>
        </p>
        <p className="text-center text-sm text-muted-foreground pt-1">
          Ainda não tem acesso? <Link to={`${base}/solicitar-acesso`} className="text-primary hover:underline" data-testid="link-solicitar">Solicitar acesso</Link>
        </p>
      </form>
    </Moldura>
  )
}

export function PortalEsqueciSenha() {
  const { base } = usePortal()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${base}/redefinir-senha`,
    })
    setEnviando(false)
    if (error && /rate|many/i.test(error.message)) { setErro('Muitas tentativas. Aguarde alguns minutos.'); return }
    setEnviado(true)   // mesma resposta exista ou não a conta (não revela e-mails cadastrados)
  }

  return (
    <Moldura>
      {enviado ? (
        <div className="text-center" data-testid="portal-esqueci-ok">
          <CheckCircle2 size={36} className="text-green-400 mx-auto mb-3" />
          <h1 className="text-lg font-bold">Verifique seu e-mail</h1>
          <p className="text-sm text-muted-foreground mt-2">Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha.</p>
          <Link to={`${base}/entrar`} className="inline-block mt-6 text-sm text-primary hover:underline">Voltar para entrar</Link>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-bold text-center">Esqueci minha senha</h1>
          <p className="text-sm text-muted-foreground text-center mt-1 mb-6">Informe seu e-mail para receber o link de nova senha.</p>
          <form onSubmit={enviar} className="space-y-4">
            <div>
              <label htmlFor="portal-email-rec" className="block text-sm font-medium mb-1.5">E-mail</label>
              <input id="portal-email-rec" type="email" required value={email} onChange={e => setEmail(e.target.value)} className={campo} />
            </div>
            {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
            <button type="submit" disabled={enviando} className={botao}>{enviando && <Loader2 size={15} className="animate-spin" />} Enviar link</button>
            <p className="text-center"><Link to={`${base}/entrar`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft size={13} /> Voltar</Link></p>
          </form>
        </>
      )}
    </Moldura>
  )
}

export function PortalRedefinirSenha() {
  const { base } = usePortal()
  const navigate = useNavigate()
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [pronto, setPronto] = useState(false)
  const [sessao, setSessao] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(ev => {
      if (ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN') setSessao(true)
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) setSessao(true) })
    return () => subscription.unsubscribe()
  }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 8) { setErro('A senha deve ter pelo menos 8 caracteres.'); return }
    if (senha !== conf) { setErro('As senhas não coincidem.'); return }
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) { setErro('Não foi possível salvar. O link pode ter expirado — peça um novo.'); return }
    setPronto(true)
    setTimeout(() => navigate(base || '/', { replace: true }), 2000)
  }

  return (
    <Moldura>
      {pronto ? (
        <div className="text-center">
          <CheckCircle2 size={36} className="text-green-400 mx-auto mb-3" />
          <h1 className="text-lg font-bold">Senha criada!</h1>
          <p className="text-sm text-muted-foreground mt-2">Entrando no portal…</p>
        </div>
      ) : !sessao ? (
        <div className="text-center">
          <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">Validando o link…</p>
          <Link to={`${base}/esqueci-senha`} className="inline-block mt-6 text-xs text-primary hover:underline">Pedir um novo link</Link>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-bold text-center">Criar nova senha</h1>
          <form onSubmit={salvar} className="space-y-4 mt-6">
            <div>
              <label htmlFor="portal-nova" className="block text-sm font-medium mb-1.5">Nova senha</label>
              <input id="portal-nova" type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} className={campo} />
            </div>
            <div>
              <label htmlFor="portal-conf" className="block text-sm font-medium mb-1.5">Repita a senha</label>
              <input id="portal-conf" type="password" autoComplete="new-password" value={conf} onChange={e => setConf(e.target.value)} className={campo} />
            </div>
            {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
            <button type="submit" disabled={enviando} className={botao}>{enviando && <Loader2 size={15} className="animate-spin" />} Salvar senha</button>
          </form>
        </>
      )}
    </Moldura>
  )
}
