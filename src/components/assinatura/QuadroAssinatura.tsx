import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import SignaturePadLib from 'signature_pad'
import { Eraser } from 'lucide-react'

// Quadro de assinatura reaproveitável (cliente, responsável, perfil).
// Botão "Limpar" VISÍVEL (antes era um botão fantasma, passava
// despercebido — feedback do usuário 2026-09-24), habilitado só enquanto
// há traço e a assinatura ainda não foi gravada.

export interface QuadroAssinaturaRef {
  vazio: () => boolean
  dataUrl: () => string
  limpar: () => void
}

interface Props {
  rotulo?: string
  onMudou?: (temTraco: boolean) => void
  altura?: string
}

const QuadroAssinatura = forwardRef<QuadroAssinaturaRef, Props>(({ rotulo, onMudou, altura = 'h-40' }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePadLib | null>(null)
  const [temTraco, setTemTraco] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    canvas.getContext('2d')?.scale(ratio, ratio)
    const pad = new SignaturePadLib(canvas, { backgroundColor: 'rgb(255,255,255)' })
    pad.addEventListener('endStroke', () => { const t = !pad.isEmpty(); setTemTraco(t); onMudou?.(t) })
    padRef.current = pad
    return () => { pad.off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function limpar() {
    padRef.current?.clear()
    setTemTraco(false)
    onMudou?.(false)
  }

  useImperativeHandle(ref, () => ({
    vazio: () => !padRef.current || padRef.current.isEmpty(),
    dataUrl: () => padRef.current?.toDataURL('image/png') ?? '',
    limpar,
  }))

  return (
    <div>
      {rotulo && <p className="text-xs text-muted-foreground mb-1">{rotulo}</p>}
      <div className="relative">
        <canvas ref={canvasRef} className={'w-full rounded-md border border-border bg-white touch-none ' + altura} aria-label={rotulo ?? 'Quadro de assinatura'} />
        {!temTraco && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-neutral-400">Assine aqui com o dedo</span>}
      </div>
      <div className="flex justify-end mt-1.5">
        <button type="button" onClick={limpar} disabled={!temTraco}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition">
          <Eraser size={13} /> Limpar
        </button>
      </div>
    </div>
  )
})
QuadroAssinatura.displayName = 'QuadroAssinatura'
export default QuadroAssinatura
