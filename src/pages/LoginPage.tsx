import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
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
      navigate('/')
    } catch {
      setError('E-mail ou senha incorretos. Verifique seus dados.')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    {
      title: 'Ordens de serviço',
      desc: 'Abertura, atribuição e acompanhamento em tempo real',
    },
    {
      title: 'Checklists técnicos',
      desc: 'Crie roteiros de verificação para qualquer tipo de validação',
    },
    {
      title: 'Assinatura digital',
      desc: 'Cliente assina direto no celular do técnico',
    },
  ]

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12"
        style={{ background: 'radial-gradient(ellipse 100% 80% at 0% 100%, rgba(124,58,237,0.15) 0%, transparent 60%), radial-gradient(ellipse 80% 60% at 100% 0%, rgba(6,182,212,0.10) 0%, transparent 60%), #0D1117' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
              <path d="M4 8h20M4 14h14M4 20h8" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="22" cy="20" r="4" fill="#06B6D4" fillOpacity="0.2" stroke="#06B6D4" strokeWidth="1.5"/>
              <path d="M20.5 20l1 1 2-2" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-base font-bold vluma-gradient-text leading-none">ATOS</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Gestão de Campo</p>
          </div>
        </div>

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
        <div className="lg:hidden flex items-center gap-3 p-6 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
              <path d="M4 8h20M4 14h14M4 20h8" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="22" cy="20" r="4" fill="#06B6D4" fillOpacity="0.2" stroke="#06B6D4" strokeWidth="1.5"/>
              <path d="M20.5 20l1 1 2-2" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold vluma-gradient-text leading-none">ATOS</p>
            <p className="text-[10px] text-muted-foreground">Gestão de Campo</p>
          </div>
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
          </div>
        </div>
      </div>
    </div>
  )
}
