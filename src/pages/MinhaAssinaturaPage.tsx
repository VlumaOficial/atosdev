import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import QuadroAssinatura, { type QuadroAssinaturaRef } from '@/components/assinatura/QuadroAssinatura'
import { urlMinhaAssinatura, salvarMinhaAssinatura } from '@/lib/assinaturaResponsavel'
import { ArrowLeft, Loader2, PenTool } from 'lucide-react'

// "Minha assinatura" — desenhada uma vez, aplicada automaticamente em
// cada OS que eu concluir. Trocar aqui NÃO altera OS já concluídas (cada
// OS guarda a própria cópia).
export default function MinhaAssinaturaPage() {
  const navigate = useNavigate()
  const [atual, setAtual] = useState<string | null | undefined>(undefined)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const quadro = useRef<QuadroAssinaturaRef>(null)

  useEffect(() => { urlMinhaAssinatura().then(u => { setAtual(u); if (!u) setEditando(true) }) }, [])

  async function salvar() {
    setMsg(null)
    if (!quadro.current || quadro.current.vazio()) { setMsg({ tipo: 'erro', texto: 'Desenhe sua assinatura no quadro.' }); return }
    setSalvando(true)
    const r = await salvarMinhaAssinatura(quadro.current.dataUrl())
    setSalvando(false)
    if (r.erro) { setMsg({ tipo: 'erro', texto: r.erro }); return }
    setAtual(await urlMinhaAssinatura())
    setEditando(false)
    setMsg({ tipo: 'ok', texto: 'Assinatura salva. Ela será aplicada nas próximas OS que você concluir.' })
  }

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft size={16} /> Voltar</button>
      <h1 className="text-xl font-semibold text-foreground">Minha assinatura</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-4">Usada como assinatura do responsável ao concluir uma OS. Trocar aqui não altera OS já concluídas.</p>
      <Card className="p-4 space-y-3">
        {atual === undefined && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Carregando...</div>}
        {atual && !editando && (
          <>
            <img src={atual} alt="Minha assinatura" data-testid="minha-assinatura" className="max-h-32 rounded-md border border-border bg-white" />
            <Button type="button" variant="outline" onClick={() => { setEditando(true); setMsg(null) }}><PenTool size={14} /> Refazer assinatura</Button>
          </>
        )}
        {editando && (
          <>
            <QuadroAssinatura ref={quadro} rotulo="Desenhe sua assinatura" />
            <div className="flex gap-2">
              {atual && <Button type="button" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>}
              <Button type="button" variant="cta" className="flex-1" loading={salvando} onClick={salvar}>Salvar assinatura</Button>
            </div>
          </>
        )}
        {msg && <p className={'text-sm ' + (msg.tipo === 'ok' ? 'text-green-400' : 'text-red-400')}>{msg.texto}</p>}
      </Card>
    </div>
  )
}
