import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import AtosLogo from '@/components/brand/AtosLogo'

export default function LoginPage() {
  const { signIn, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/')
  }, [user, navigate])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch {
      setError('E-mail ou senha incorretos. Verifique seus dados.')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    { title: 'Ordens de serviço', desc: 'Abertura, atribuição e acompanhamento em tempo real' },
    { title: 'Checklists técnicos', desc: 'Crie roteiros de verificação para qualquer tipo de validação' },
    { title: 'Assinatura digital', desc: 'Cliente assina direto no celular do técnico' },
  ]

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12"
        style={{ background: 'radial-gradient(ellipse 100% 80% at 0% 100%, rgba(124,58,237,0.15) 0%, transparent 60%), radial-gradient(ellipse 80% 60% at 100% 0%, rgba(6,182,212,0.10) 0%, transparent 60%), #0D1117' }}>
        <AtosLogo size={36} />

        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Gerencie sua<br />
            <span className="vluma-gradient-text">equipe de campo</span><br />
            com eficiência
          </h1>
          <p className="text-muted-foreground text-base max-w-sm">
            Ordens de serviço, checklists técnicos e assinatura digital — tudo em um só lugar.
          </p>
          <div className="mt-10 space-y-4">
            {features.map(f => (
              <div key={f.title} className="flex items-start gap-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0">
                  <rect width="24" height="24" rx="6" fill="#8B5CF6" fillOpacity="0.15"/>
                  <path d="M7 12l4 4 6-7" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <p className="text-sm font-medium text-foreground">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div />
      </div>

      <div className="flex-1 flex flex-col min-h-screen lg:min-h-0">
        <div className="lg:hidden p-6 border-b border-border">
          <AtosLogo size={36} />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <h2 className="text-2xl font-bold mb-1">Bem-vindo de volta</h2>
            <p className="text-muted-foreground text-sm mb-8">Entre na sua conta para acessar o sistema</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="email">E-mail</label>
                <input id="email" type="email" autoComplete="email" required value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
                  className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="password">Senha</label>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                    className="w-full px-3 py-2.5 pr-10 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{error}</div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 px-4 rounded-md text-sm font-semibold btn-cta disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
            <div className="mt-4 text-center">
              <Link to="/esqueci-senha" className="text-sm text-muted-foreground hover:text-primary transition">
                Esqueceu a senha?
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
