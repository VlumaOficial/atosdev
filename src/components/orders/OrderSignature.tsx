import { useEffect, useRef, useState } from 'react'
import SignaturePadLib from 'signature_pad'
import { uploadAssinatura, urlAssinatura } from '@/lib/uploadSignature'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { PenTool, Eraser } from 'lucide-react'

interface Props {
  orderId: string
  signaturePath: string | null
  signerName: string | null
  readOnly?: boolean
  onSigned?: () => void
}

export default function OrderSignature({ orderId, signaturePath, signerName, readOnly, onSigned }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePadLib | null>(null)
  const [nome, setNome] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [temTraco, setTemTraco] = useState(false)

  useEffect(() => {
    let ativo = true
    if (signaturePath) {
      urlAssinatura(signaturePath).then(url => { if (ativo) setPreview(url) })
    } else {
      setPreview(null)
    }
    return () => { ativo = false }
  }, [signaturePath])

  // inicializa o canvas de captura só quando ainda não há assinatura e não é somente leitura
  useEffect(() => {
    if (readOnly || signaturePath || !canvasRef.current) return
    const canvas = canvasRef.current
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    canvas.getContext('2d')?.scale(ratio, ratio)

    const pad = new SignaturePadLib(canvas, { backgroundColor: 'rgb(255,255,255)' })
    pad.addEventListener('endStroke', () => setTemTraco(!pad.isEmpty()))
    padRef.current = pad
    return () => { pad.off() }
  }, [readOnly, signaturePath])

  function limpar() {
    padRef.current?.clear()
    setTemTraco(false)
  }

  async function salvar() {
    setErro('')
    if (!nome.trim()) { setErro('Informe o nome de quem está assinando.'); return }
    if (!padRef.current || padRef.current.isEmpty()) { setErro('Colete a assinatura no campo acima.'); return }
    setEnviando(true)
    try {
      const dataUrl = padRef.current.toDataURL('image/png')
      const res = await uploadAssinatura(dataUrl, orderId, nome.trim())
      if (res.erro) {
        setErro(res.erro)
      } else {
        onSigned?.()
      }
    } catch {
      setErro('Não foi possível salvar a assinatura.')
    } finally {
      setEnviando(false)
    }
  }

  if (signaturePath) {
    return (
      <div>
        {preview && <img src={preview} alt="Assinatura" className="max-h-32 rounded-md border border-border bg-white" />}
        {signerName && <p className="text-xs text-muted-foreground mt-2">Assinado por {signerName}</p>}
      </div>
    )
  }

  if (readOnly) {
    return <p className="text-sm text-muted-foreground text-center py-2">Ainda sem assinatura.</p>
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="signer-name">Nome de quem assina</Label>
        <Input id="signer-name" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do cliente/responsável" />
      </div>
      <div>
        <canvas
          ref={canvasRef}
          className="w-full h-40 rounded-md border border-border bg-white touch-none"
        />
      </div>
      {erro && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{erro}</div>}
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={limpar} disabled={!temTraco}><Eraser size={14} /> Limpar</Button>
        <Button type="button" variant="cta" className="flex-1" loading={enviando} onClick={salvar}><PenTool size={14} /> Salvar assinatura</Button>
      </div>
    </div>
  )
}
