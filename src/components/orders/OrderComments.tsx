import { useState } from 'react'
import { useOrderComments } from '@/hooks/useOrderComments'
import { Button } from '@/components/ui/button'
import { MessageSquare, Send, ChevronDown, ChevronUp, Lock, Headset } from 'lucide-react'
import AnexosCliente from '@/components/portal/AnexosCliente'
import { cn } from '@/lib/utils'

function fmt(dt: string): string {
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Conversa da OS. Em chamado aberto pelo portal há DOIS botões distintos (padrão Zendesk/Freshdesk):
// "Responder ao cliente" (aparece no portal) e "Nota interna" (nunca sai da empresa). Em OS comum, só comentário interno.
export default function OrderComments({ orderId, portal = false, podeResponder = true }: { orderId: string; portal?: boolean; podeResponder?: boolean }) {
  const { comments, addComment } = useOrderComments(orderId)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState<'interno' | 'cliente' | null>(null)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState('')

  async function enviar(visibilidade: 'interno' | 'cliente') {
    if (!text.trim()) return
    setErro(''); setSaving(visibilidade)
    try {
      await addComment(text.trim(), visibilidade)
      setText('')
      setAberto(true)
    } catch (e) {
      setErro((e as Error).message || 'Não foi possível enviar.')
    } finally {
      setSaving(null)
    }
  }

  const ultimo = comments.length > 0 ? comments[comments.length - 1] : null
  const campo = 'px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition'

  return (
    <div data-testid="conversa-os">
      <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-1.5"><MessageSquare size={15} /> {portal ? 'Conversa' : 'Comentários'}</p>

      {portal ? (
        <div className="mb-4 space-y-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={2000} aria-label="Mensagem"
            placeholder="Escreva aqui. Use “Responder ao cliente” para o cliente ver no portal, ou “Nota interna” para ficar só entre a equipe."
            className={campo + ' w-full'} data-testid="conversa-texto" />
          <div className="flex flex-wrap gap-2">
            {podeResponder && (
              <Button type="button" variant="cta" loading={saving === 'cliente'} disabled={!text.trim() || saving !== null} onClick={() => enviar('cliente')} data-testid="responder-cliente">
                <Headset size={14} /> Responder ao cliente
              </Button>
            )}
            <Button type="button" variant="outline" loading={saving === 'interno'} disabled={!text.trim() || saving !== null} onClick={() => enviar('interno')} data-testid="nota-interna">
              <Lock size={14} /> Nota interna
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">O cliente só vê o que for enviado com "Responder ao cliente". Nota interna nunca aparece no portal.</p>
          {erro && <p className="text-xs text-red-400" role="alert">{erro}</p>}
        </div>
      ) : (
        <div className="flex gap-2 mb-4">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar('interno') } }}
            placeholder="Escreva um comentário..."
            className={campo + ' flex-1'}
          />
          <Button type="button" variant="cta" loading={saving === 'interno'} onClick={() => enviar('interno')}><Send size={15} /></Button>
        </div>
      )}
      {!portal && erro && <p className="text-xs text-red-400 mb-2" role="alert">{erro}</p>}

      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
      ) : (
        <div>
          <button
            onClick={() => setAberto(v => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <span className="text-xs text-muted-foreground min-w-0 truncate">
              {comments.length} {comments.length === 1 ? 'mensagem' : 'mensagens'}
              {!aberto && ultimo && (
                <> · <span className="text-foreground">{ultimo.author_name ?? 'Usuário'}:</span> {ultimo.comment}</>
              )}
            </span>
            {aberto ? <ChevronUp size={16} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />}
          </button>

          {aberto && (
            <div className="space-y-3 mt-3" data-testid="conversa-lista">
              {comments.map(c => {
                const doCliente = c.autor_portal_id !== null
                const aoCliente = c.visibilidade === 'cliente' && !doCliente
                return (
                  <div key={c.id} data-visibilidade={doCliente ? 'do-cliente' : c.visibilidade}
                    className={cn('border-l-2 pl-3', doCliente ? 'border-green-500/50' : aoCliente ? 'border-primary/60' : 'border-border')}>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">{c.author_name ?? 'Usuário'}</span>
                      {portal && (
                        doCliente ? <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">Cliente</span>
                          : aoCliente ? <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">Resposta ao cliente</span>
                            : <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[10px] inline-flex items-center gap-1"><Lock size={9} /> Nota interna</span>
                      )}
                      <span className="text-muted-foreground">{fmt(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap mt-0.5">{c.comment}</p>
                    {c.anexos.length > 0 && <div className="mt-2 max-w-sm"><AnexosCliente anexos={c.anexos} /></div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
