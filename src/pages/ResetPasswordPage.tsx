import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // O Supabase cria uma sessão de recuperação ao abrir o link do e-mail
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setSessionReady(true)
      }
    })
    // Verifica se já há sessão ativa (caso o evento já tenha ocorrido)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch {
      setError('Não foi possível redefinir a senha. O link pode ter expirado. Solicite um novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
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

        {done ? (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={26} className="text-green-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Senha redefinida!</h2>
            <p className="text-muted-foreground text-sm">
              Sua senha foi alterada com sucesso. Redirecionando para o login...
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-1">Criar nova senha</h2>
            <p className="text-muted-foreground text-sm mb-8">
              Defina uma nova senha para sua conta.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="password">Nova senha</label>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                    className="w-full px-3 py-2.5 pr-10 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="confirm">Confirmar nova senha</label>
                <input id="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirm}
                  onChange={e => setConfirm(e.target.value)} placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
              </div>

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{error}</div>
              )}

              <button type="submit" disabled={loading || !sessionReady}
                className="w-full py-2.5 px-4 rounded-md text-sm font-semibold btn-cta disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </button>

              {!sessionReady && (
                <p className="text-xs text-muted-foreground text-center">
                  Validando o link de redefinição...
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  )
}
