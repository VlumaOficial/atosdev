import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, MailCheck } from 'lucide-react'
import AtosLogo from '@/components/brand/AtosLogo'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })
      if (error) throw error
      setSent(true)
    } catch {
      setError('Não foi possível enviar o e-mail. Verifique o endereço e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <AtosLogo size={36} />

        {sent ? (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <MailCheck size={26} className="text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Verifique seu e-mail</h2>
            <p className="text-muted-foreground text-sm mb-8">
              Se houver uma conta associada a <strong className="text-foreground">{email}</strong>, enviamos um link para redefinir a senha. O link expira em 1 hora.
            </p>
            <Link to="/login" className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition">
              <ArrowLeft size={16} /> Voltar para o login
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-1">Esqueceu a senha?</h2>
            <p className="text-muted-foreground text-sm mb-8">
              Informe seu e-mail e enviaremos um link para você criar uma nova senha.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="email">E-mail</label>
                <input id="email" type="email" autoComplete="email" required value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
                  className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
              </div>

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{error}</div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 px-4 rounded-md text-sm font-semibold btn-cta disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Enviando...' : 'Enviar link de redefinição'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
                <ArrowLeft size={16} /> Voltar para o login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
