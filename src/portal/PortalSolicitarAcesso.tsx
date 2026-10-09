import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import { chamarAcesso } from '@/lib/portalAcesso'
import { usePortal } from './PortalContext'
import { MarcaPortal, RodapePortal, ContatosEmpresa } from './PortalLayout'
import Turnstile from './Turnstile'

// "Solicitar acesso": quem ainda não tem conta pede o acesso. A resposta é sempre a
// mesma (não revela se o e-mail ou o cliente existem); a empresa ou o Supervisor aprovam.
const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

export default function PortalSolicitarAcesso() {
  const { id, base } = usePortal()
  const [f, setF] = useState({ nome: '', email: '', celular: '', cliente: '', mensagem: '' })
  const [token, setToken] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState(false)
  const chave = (id as any).turnstile_site_key as string | undefined
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }))

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (f.nome.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(f.email.trim())) { setErro('Informe o seu nome e um e-mail válido.'); return }
    if (chave && !token) { setErro('Confirme que você não é um robô.'); return }
    setEnviando(true)
    const r = await chamarAcesso({ acao: 'solicitar', tenant_id: id.tenant_id, ...f, turnstile: token })
    setEnviando(false)
    if (!r.ok) { setErro(r.erro ?? 'Não foi possível enviar.'); return }
    setFeito(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><MarcaPortal grande /></div>
        {feito ? (
          <div className="text-center" data-testid="solicitacao-enviada">
            <CheckCircle2 size={36} className="text-green-400 mx-auto mb-3" />
            <h1 className="text-lg font-bold">Pedido enviado</h1>
            <p className="text-sm text-muted-foreground mt-2">Se os dados conferirem, você receberá um e-mail da {id.empresa} com o link para criar a sua senha. Pode levar um tempo: o pedido é analisado por uma pessoa.</p>
            <div className="mt-4 flex justify-center"><ContatosEmpresa /></div>
            <Link to={`${base}/entrar`} className="inline-block mt-6 text-sm text-primary hover:underline">Voltar para entrar</Link>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-center">Solicitar acesso</h1>
            <p className="text-sm text-muted-foreground text-center mt-1 mb-6">Preencha para pedir acesso ao portal da {id.empresa}. Você receberá a resposta por e-mail.</p>
            <form onSubmit={enviar} className="space-y-4" data-testid="form-solicitar">
              <div><label className="block text-sm font-medium mb-1.5" htmlFor="sa-nome">Seu nome *</label><input id="sa-nome" value={f.nome} onChange={e => set('nome', e.target.value)} className={campo} /></div>
              <div><label className="block text-sm font-medium mb-1.5" htmlFor="sa-email">E-mail *</label><input id="sa-email" type="email" value={f.email} onChange={e => set('email', e.target.value)} className={campo} /></div>
              <div><label className="block text-sm font-medium mb-1.5" htmlFor="sa-cel">Celular <span className="text-muted-foreground font-normal">(opcional)</span></label><input id="sa-cel" inputMode="tel" value={f.celular} onChange={e => set('celular', e.target.value)} className={campo} /></div>
              <div><label className="block text-sm font-medium mb-1.5" htmlFor="sa-cli">Empresa em que você trabalha</label><input id="sa-cli" value={f.cliente} onChange={e => set('cliente', e.target.value)} placeholder="Nome da empresa atendida" className={campo} /></div>
              <div><label className="block text-sm font-medium mb-1.5" htmlFor="sa-msg">Mensagem <span className="text-muted-foreground font-normal">(opcional)</span></label><textarea id="sa-msg" rows={2} maxLength={500} value={f.mensagem} onChange={e => set('mensagem', e.target.value)} className={campo + ' resize-none'} /></div>
              {chave && <Turnstile siteKey={chave} onToken={setToken} />}
              {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
              <button type="submit" disabled={enviando} data-testid="solicitar-enviar"
                className="w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {enviando && <Loader2 size={15} className="animate-spin" />} Enviar pedido
              </button>
              <p className="text-center"><Link to={`${base}/entrar`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft size={13} /> Voltar</Link></p>
            </form>
          </>
        )}
        <RodapePortal />
      </div>
    </div>
  )
}
