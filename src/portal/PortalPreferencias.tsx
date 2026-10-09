import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Check, MessageCircle, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePortal } from './PortalContext'
import PortalPagina from './PortalPagina'

// Preferências: por onde receber os avisos (entre os canais que a empresa liberou) e o
// consentimento de comunicação (LGPD) — dado e retirado aqui a qualquer momento.
export default function PortalPreferencias() { return <PortalPagina>{() => <Prefs />}</PortalPagina> }

function Prefs() {
  const { id, base } = usePortal()
  const [p, setP] = useState<any>(null)
  const [email, setEmail] = useState(true)
  const [cons, setCons] = useState(false)
  const [cel, setCel] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase.rpc('portal_minhas_preferencias', { p_tenant: id.tenant_id }).then(({ data }) => {
      setP(data); setEmail(!!(data as any)?.canal_email); setCons(!!(data as any)?.aceite_comunicacao); setCel((data as any)?.celular ?? '')
    })
  }, [id.tenant_id])

  async function salvar() {
    setMsg(null); setSalvando(true)
    const { error } = await supabase.rpc('portal_salvar_preferencias', { p_tenant: id.tenant_id, p_email: email, p_celular: cel, p_consentimento: cons })
    setSalvando(false)
    setMsg(error ? { ok: false, texto: error.message } : { ok: true, texto: 'Preferências salvas.' })
  }
  if (!p) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const empresa = String(p.empresa ?? id.empresa).replace(/\.$/, '')
  return (
    <div data-testid="portal-preferencias">
      <h1 className="text-xl font-bold text-foreground">Preferências</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-5">Escolha como a {empresa} avisa você sobre os seus chamados.</p>

      <div className="vluma-card p-4 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={cons} onChange={e => setCons(e.target.checked)} data-testid="pref-consentimento" />
          <span><span className="text-sm font-medium text-foreground">Aceito receber avisos dos meus chamados</span>
            <span className="block text-xs text-muted-foreground mt-0.5">Só mensagens de serviço (abertura, agendamento, andamento e conclusão). Você pode retirar este consentimento quando quiser. Sem ele, acompanha tudo aqui no portal.</span></span>
        </label>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground mb-2">Por onde receber</p>
          {p.email_liberado ? (
            <label className={'flex items-start gap-3 ' + (cons ? 'cursor-pointer' : 'opacity-60')}>
              <input type="checkbox" className="mt-1" checked={email} disabled={!cons} onChange={e => setEmail(e.target.checked)} data-testid="pref-email" />
              <span><span className="text-sm text-foreground">E-mail</span><span className="block text-xs text-muted-foreground">{p.email}</span></span>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5" data-testid="canal-email-indisponivel"><Info size={13} className="mt-0.5 flex-shrink-0" /> A {empresa} não disponibiliza avisos por e-mail no momento.</p>
          )}
          <div className="flex items-start gap-3 mt-3 opacity-60" data-testid="canal-whatsapp-indisponivel">
            <MessageCircle size={16} className="mt-0.5 text-muted-foreground" />
            <span><span className="text-sm text-foreground">WhatsApp</span><span className="block text-xs text-muted-foreground">Indisponível no momento. Você ainda pode falar com a {empresa} pelo botão de WhatsApp dos contatos.</span></span>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <label htmlFor="pref-cel" className="block text-sm font-medium text-foreground mb-1">Seu celular <span className="text-muted-foreground font-normal">(opcional)</span></label>
          <input id="pref-cel" inputMode="tel" value={cel} onChange={e => setCel(e.target.value)} placeholder="(71) 90000-0000"
            className="w-full sm:w-64 px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button onClick={salvar} disabled={salvando} data-testid="pref-salvar" className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">{salvando ? 'Salvando…' : 'Salvar'}</button>
        {msg && <span className={'text-sm inline-flex items-center gap-1 ' + (msg.ok ? 'text-green-400' : 'text-red-400')} role="status">{msg.ok && <Check size={14} />}{msg.texto}</span>}
      </div>
      <p className="text-xs text-muted-foreground mt-6">Leia o <Link to={`${base}/termos/privacidade`} className="text-primary hover:underline">aviso de privacidade</Link> e os <Link to={`${base}/termos/uso`} className="text-primary hover:underline">termos de uso</Link>.</p>
    </div>
  )
}
