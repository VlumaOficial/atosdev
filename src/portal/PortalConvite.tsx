import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { chamarAcesso } from '@/lib/portalAcesso'
import { usePortal } from './PortalContext'
import { MarcaPortal, RodapePortal } from './PortalLayout'

// Tela do link do convite: a pessoa vê quem a convidou e CRIA A PRÓPRIA SENHA.
// Depois entra no portal (e aceita os termos no primeiro acesso).
const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
const MOTIVOS: Record<string, string> = {
  invalido: 'Este link de convite não é válido.',
  usado: 'Este convite já foi usado. Entre com o seu e-mail e a sua senha.',
  revogado: 'Este convite foi cancelado. Peça um novo a quem convidou você.',
  expirado: 'Este convite expirou. Peça um novo a quem convidou você.',
}

export default function PortalConvite() {
  const { token } = useParams()
  const { base, id } = usePortal()
  const navigate = useNavigate()
  const [info, setInfo] = useState<any>(null)
  const [nome, setNome] = useState('')
  const [celular, setCelular] = useState('')
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    chamarAcesso({ acao: 'consultar', token }).then(r => { setInfo(r.dados ?? { valido: false, motivo: 'invalido' }); if (r.dados?.nome) setNome(r.dados.nome) })
  }, [token])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) { setErro('A senha deve ter pelo menos 8 caracteres, com letras e números.'); return }
    if (senha !== conf) { setErro('As senhas não coincidem.'); return }
    setEnviando(true)
    const r = await chamarAcesso({ acao: 'aceitar', token, nome, senha, celular })
    if (!r.ok) { setEnviando(false); setErro(r.erro ?? 'Não foi possível criar a conta.'); return }
    const { error } = await supabase.auth.signInWithPassword({ email: r.dados.email, password: senha })
    setEnviando(false)
    navigate(error ? `${base}/entrar` : (base || '/'), { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><MarcaPortal grande /></div>
        {!info ? <div className="flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          : !info.valido ? (
            <div className="text-center" data-testid="convite-invalido">
              <AlertTriangle size={32} className="text-amber-400 mx-auto mb-3" />
              <h1 className="text-lg font-bold">Convite indisponível</h1>
              <p className="text-sm text-muted-foreground mt-2">{MOTIVOS[info.motivo] ?? MOTIVOS.invalido}</p>
              <Link to={`${base}/entrar`} className="inline-block mt-6 text-sm text-primary hover:underline">Ir para a entrada</Link>
            </div>
          ) : (
            <form onSubmit={criar} className="space-y-4" data-testid="convite-form">
              <div className="text-center">
                <CheckCircle2 size={28} className="text-primary mx-auto mb-2" />
                <h1 className="text-xl font-bold">Bem-vindo(a)!</h1>
                <p className="text-sm text-muted-foreground mt-1">A <b>{String(info.empresa).replace(/\.$/, '')}</b> liberou o seu acesso como <b>{info.perfil === 'supervisor' ? 'Supervisor' : 'Usuário'}</b> de <b>{info.cliente}</b>. Crie a sua senha para entrar.</p>
              </div>
              <div><label className="block text-sm font-medium mb-1.5" htmlFor="cv-email">E-mail</label><input id="cv-email" value={info.email} disabled className={campo + ' opacity-70'} /></div>
              <div><label className="block text-sm font-medium mb-1.5" htmlFor="cv-nome">Seu nome</label><input id="cv-nome" value={nome} onChange={e => setNome(e.target.value)} className={campo} required /></div>
              <div><label className="block text-sm font-medium mb-1.5" htmlFor="cv-cel">Celular <span className="text-muted-foreground font-normal">(opcional)</span></label><input id="cv-cel" inputMode="tel" value={celular} onChange={e => setCelular(e.target.value)} placeholder="(71) 90000-0000" className={campo} /></div>
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="cv-senha">Crie uma senha</label>
                <div className="relative">
                  <input id="cv-senha" type={ver ? 'text' : 'password'} autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} className={campo + ' pr-10'} />
                  <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground">{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Mínimo de 8 caracteres, com letras e números.</p>
              </div>
              <div><label className="block text-sm font-medium mb-1.5" htmlFor="cv-conf">Repita a senha</label><input id="cv-conf" type="password" autoComplete="new-password" value={conf} onChange={e => setConf(e.target.value)} className={campo} /></div>
              {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
              <button type="submit" disabled={enviando} data-testid="convite-criar"
                className="w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {enviando && <Loader2 size={15} className="animate-spin" />} Criar senha e entrar
              </button>
              <p className="text-[11px] text-center text-muted-foreground">No primeiro acesso, você lê e aceita os termos de uso e o aviso de privacidade da {id.empresa.replace(/\.$/, '')}.</p>
            </form>
          )}
        <RodapePortal />
      </div>
    </div>
  )
}
