import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, RotateCcw, Check, Camera } from 'lucide-react'

// Câmera embutida na própria página (getUserMedia), em vez de
// <input capture> que abre o app de Câmera nativo. Motivo: em aparelhos
// com pouca RAM livre o Android mata a aba do navegador na troca
// navegador → app de Câmera ("insuficiência de memória"), e isso acontece
// fora da página — nenhuma otimização de JS evita. Aqui a foto é só um
// frame do <video>, com resolução controlada pelo app, sem processo externo.
//
// Sem opção de galeria de propósito: o carimbo registra data/GPS do
// momento do envio, então uma foto antiga passaria como atual.
// Se o navegador não suportar getUserMedia (ou não houver câmera), cai
// para o <input capture> antigo — melhor ter o risco de memória do que
// não conseguir anexar nada. Com a permissão de câmera negada, o mesmo
// recurso aparece como opção secundária ao "Tentar novamente".

const RESOLUCAO_IDEAL = { width: { ideal: 1920 }, height: { ideal: 1080 } }
const QUALIDADE_CAPTURA = 0.92

type Estado = 'iniciando' | 'visor' | 'previa' | 'negado' | 'fallback'

interface Props {
  open: boolean
  onCapturar: (file: File) => void
  onFechar: () => void
}

export default function CameraCaptura({ open, onCapturar, onFechar }: Props) {
  const [estado, setEstado] = useState<Estado>('iniciando')
  const [previa, setPrevia] = useState<{ url: string; blob: Blob } | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  function pararCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function descartarPrevia() {
    setPrevia(p => { if (p) URL.revokeObjectURL(p.url); return null })
  }

  async function iniciarCamera() {
    setEstado('iniciando')
    if (!navigator.mediaDevices?.getUserMedia) {
      setEstado('fallback')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, ...RESOLUCAO_IDEAL },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setEstado('visor')
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') setEstado('negado')
      else setEstado('fallback')
    }
  }

  useEffect(() => {
    if (!open) return
    iniciarCamera()
    return () => { pararCamera(); descartarPrevia() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function capturar() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      setPrevia({ url: URL.createObjectURL(blob), blob })
      setEstado('previa')
    }, 'image/jpeg', QUALIDADE_CAPTURA)
  }

  function usarFoto() {
    if (!previa) return
    const file = new File([previa.blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
    pararCamera()
    descartarPrevia()
    onCapturar(file)
  }

  function tirarOutra() {
    descartarPrevia()
    setEstado('visor')
    videoRef.current?.play().catch(() => {})
  }

  function fechar() {
    pararCamera()
    descartarPrevia()
    onFechar()
  }

  function handleArquivoFallback(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    onCapturar(file)
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" role="dialog" aria-label="Câmera">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium">Foto de evidência</span>
        <button type="button" onClick={fechar} aria-label="Fechar câmera"
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">
          <X size={18} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        {/* o <video> fica sempre montado pra manter o stream ao voltar da prévia */}
        <video ref={videoRef} playsInline muted autoPlay
          className={'max-w-full max-h-full object-contain ' + (estado === 'visor' ? '' : 'hidden')} />

        {estado === 'previa' && previa && (
          <img src={previa.url} alt="Prévia da foto" className="max-w-full max-h-full object-contain" />
        )}

        {(estado === 'negado' || estado === 'fallback') && (
          <input type="file" accept="image/*" capture="environment" onChange={handleArquivoFallback} className="hidden" id="camera-fallback" />
        )}

        {estado === 'iniciando' && <Loader2 size={28} className="animate-spin text-white/70" />}

        {estado === 'negado' && (
          <div className="px-6 text-center text-white space-y-3">
            <p className="text-sm">Permissão de câmera negada. Libere a câmera para este site nas configurações do navegador e tente de novo.</p>
            <button type="button" onClick={iniciarCamera}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 text-sm hover:bg-white/20 transition">
              <RotateCcw size={14} /> Tentar novamente
            </button>
            {/* app de Câmera nativo não depende da permissão do site — nunca deixa o técnico travado */}
            <label htmlFor="camera-fallback" className="block text-xs text-white/60 underline cursor-pointer">
              Usar a câmera do aparelho
            </label>
          </div>
        )}

        {estado === 'fallback' && (
          <div className="px-6 text-center text-white space-y-3">
            <p className="text-sm">Não foi possível abrir a câmera nesta tela. Use a câmera do aparelho.</p>
            <label htmlFor="camera-fallback"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 text-sm hover:bg-white/20 transition cursor-pointer">
              <Camera size={14} /> Abrir câmera do aparelho
            </label>
          </div>
        )}
      </div>

      <div className="h-28 flex items-center justify-center gap-10 pb-[env(safe-area-inset-bottom)]">
        {estado === 'visor' && (
          <button type="button" onClick={capturar} aria-label="Tirar foto"
            className="w-16 h-16 rounded-full border-4 border-white bg-white/20 active:bg-white/60 transition" />
        )}
        {estado === 'previa' && (
          <>
            <button type="button" onClick={tirarOutra}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-white/10 text-white text-sm hover:bg-white/20 transition">
              <RotateCcw size={15} /> Tirar outra
            </button>
            <button type="button" onClick={usarFoto}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition">
              <Check size={15} /> Usar foto
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
