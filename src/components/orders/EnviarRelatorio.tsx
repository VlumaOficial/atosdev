import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { MessageCircle, Mail, CheckCircle2 } from 'lucide-react'
import { useConfigEnvio, podeEnviar, montarMensagem, mascaraTelefone, telefoneValido, mascararTelefoneLgpd, linkWhatsApp } from '@/lib/envio'
import { nomeEmpresa } from '@/lib/empresa'
import { registrarEvento } from '@/lib/orderEvents'

// Botões de envio do relatório na OS concluída (técnico e admin).
// WhatsApp: abre o WhatsApp do próprio aparelho com a mensagem pronta.
// E-mail: enviado pela plataforma (Edge Function enviar-relatorio), com o
// PDF anexado. O destino é digitado na hora — sem cadastro prévio.

interface Props { orderId: string; numero: string; codigo: string; cliente: string }

export default function EnviarRelatorio({ orderId, numero, codigo, cliente }: Props) {
  const { user, tenant } = useAuth()
  const { config } = useConfigEnvio(tenant?.id)
  const [canal, setCanal] = useState<'whatsapp' | 'email' | null>(null)
  const [destino, setDestino] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  if (!config || !podeEnviar(user, config) || (!config.whatsapp_ativo && !config.email_ativo)) return null
  const link = `${window.location.origin}/verificar/${codigo}`

  function abrir(c: 'whatsapp' | 'email') {
    setCanal(c); setDestino(''); setErro(''); setOk('')
    setMensagem(montarMensagem(config!.mensagem, { os: numero, empresa: nomeEmpresa(tenant), cliente, link }))
  }

  async function enviar() {
    setErro('')
    if (canal === 'whatsapp') {
      if (!telefoneValido(destino)) { setErro('Informe o celular com DDD, ex.: (71) 99999-1234.'); return }
      window.open(linkWhatsApp(destino, mensagem), '_blank', 'noopener')
      await registrarEvento(orderId, 'report_sent', { canal: 'whatsapp', destino: mascararTelefoneLgpd(destino) })
      setOk('WhatsApp aberto com a mensagem pronta — é só tocar em enviar.')
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino.trim())) { setErro('E-mail inválido.'); return }
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('enviar-relatorio', { body: { order_id: orderId, destino: destino.trim(), mensagem } })
    setEnviando(false)
    const d = data as any
    if (error || !d?.ok) {
      let msg = d?.erro
      if (!msg && (error as any)?.context?.json) msg = (await (error as any).context.json().catch(() => null))?.erro
      setErro(msg ?? 'Não foi possível enviar o e-mail.'); return
    }
    setOk(`E-mail enviado para ${destino.trim()}${d.remetente === 'proprio' ? ' pelo e-mail da empresa' : ''}.`)
  }

  const cls = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
  return (
    <div className="flex flex-wrap gap-2 mt-3" data-testid="enviar-relatorio">
      {config.whatsapp_ativo && (
        <button type="button" onClick={() => abrir('whatsapp')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-green-500/40 text-green-400 text-sm font-medium hover:bg-green-500/10">
          <MessageCircle size={15} /> Enviar por WhatsApp
        </button>
      )}
      {config.email_ativo && (
        <button type="button" onClick={() => abrir('email')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-foreground text-sm font-medium hover:bg-secondary">
          <Mail size={15} /> Enviar por e-mail
        </button>
      )}

      <Modal open={!!canal} onOpenChange={o => { if (!o && !enviando) setCanal(null) }}
        title={canal === 'whatsapp' ? 'Enviar por WhatsApp' : 'Enviar por e-mail'} description={`Relatório ${numero}`}>
        {ok ? (
          <div className="space-y-4">
            <p className="text-sm text-green-400 flex items-start gap-2" data-testid="envio-ok"><CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> {ok}</p>
            <div className="flex justify-end"><Button type="button" variant="cta" onClick={() => setCanal(null)}>Fechar</Button></div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="env-destino" className="block text-xs text-muted-foreground mb-1">{canal === 'whatsapp' ? 'Celular do cliente (com DDD)' : 'E-mail do cliente'}</label>
              <input id="env-destino" value={destino} autoFocus
                onChange={e => setDestino(canal === 'whatsapp' ? mascaraTelefone(e.target.value) : e.target.value)}
                inputMode={canal === 'whatsapp' ? 'tel' : 'email'} placeholder={canal === 'whatsapp' ? '(71) 99999-1234' : 'cliente@empresa.com.br'} className={cls} />
            </div>
            <div>
              <label htmlFor="env-msg" className="block text-xs text-muted-foreground mb-1">Mensagem</label>
              <textarea id="env-msg" value={mensagem} onChange={e => setMensagem(e.target.value)} rows={5} className={cls + ' resize-none'} />
              {canal === 'email' && <p className="text-[11px] text-muted-foreground mt-1">O relatório em PDF vai anexado.</p>}
              {canal === 'whatsapp' && <p className="text-[11px] text-muted-foreground mt-1">Abre o WhatsApp deste aparelho com a mensagem pronta.</p>}
            </div>
            {erro && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2" data-testid="envio-erro">{erro}</div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCanal(null)} disabled={enviando}>Cancelar</Button>
              <Button type="button" variant="cta" loading={enviando} onClick={enviar}>{canal === 'whatsapp' ? 'Abrir WhatsApp' : 'Enviar e-mail'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
