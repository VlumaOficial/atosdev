import { useState } from 'react'
import { useOrderComments } from '@/hooks/useOrderComments'
import { Button } from '@/components/ui/button'
import { MessageSquare, Send, ChevronDown, ChevronUp } from 'lucide-react'

function fmt(dt: string): string {
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function OrderComments({ orderId }: { orderId: string }) {
  const { comments, addComment } = useOrderComments(orderId)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [aberto, setAberto] = useState(false)

  async function handleAdd() {
    if (!text.trim()) return
    setSaving(true)
    try {
      await addComment(text.trim())
      setText('')
      setAberto(true)
    } catch {
      alert('Não foi possível enviar o comentário.')
    } finally {
      setSaving(false)
    }
  }

  const ultimo = comments.length > 0 ? comments[comments.length - 1] : null

  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-1.5"><MessageSquare size={15} /> Comentários</p>

      <div className="flex gap-2 mb-4">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
          placeholder="Escreva um comentário..."
          className="flex-1 px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
        <Button type="button" variant="cta" loading={saving} onClick={handleAdd}><Send size={15} /></Button>
      </div>

      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
      ) : (
        <div>
          <button
            onClick={() => setAberto(v => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <span className="text-xs text-muted-foreground min-w-0 truncate">
              {comments.length} {comments.length === 1 ? 'comentário' : 'comentários'}
              {!aberto && ultimo && (
                <> · <span className="text-foreground">{ultimo.author_name ?? 'Usuário'}:</span> {ultimo.comment}</>
              )}
            </span>
            {aberto ? <ChevronUp size={16} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />}
          </button>

          {aberto && (
            <div className="space-y-3 mt-3">
              {comments.map(c => (
                <div key={c.id} className="border-l-2 border-primary/30 pl-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-foreground">{c.author_name ?? 'Usuário'}</span>
                    <span className="text-muted-foreground">{fmt(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap mt-0.5">{c.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
