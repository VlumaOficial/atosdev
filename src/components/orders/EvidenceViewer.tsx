import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Download, Loader2, ShieldCheck } from 'lucide-react'
import { urlDownloadEvidencia, urlEvidencia, codigoDaFoto, formatarCodigo } from '@/lib/uploadEvidencia'

// Foto de evidência em tela cheia (sem recorte — o carimbo fica sempre
// visível) + download do arquivo carimbado. Dialog do Radix pelo mesmo
// motivo do CameraCaptura: também é aberto de dentro do modal do checklist.
interface Props {
  path: string | null
  onFechar: () => void
}

// A foto CHEIA só é baixada aqui (ao abrir) — listas usam a miniatura
export default function EvidenceViewer({ path, onFechar }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [urlDownload, setUrlDownload] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setUrl(null)
    setUrlDownload(null)
    setCodigo(null)
    if (path) {
      codigoDaFoto(path).then(c => { if (ativo) setCodigo(c) })
      urlEvidencia(path).then(u => { if (ativo) setUrl(u) })
      urlDownloadEvidencia(path).then(u => { if (ativo) setUrlDownload(u) })
    }
    return () => { ativo = false }
  }, [path])

  return (
    <Dialog.Root open={!!path} onOpenChange={(o) => { if (!o) onFechar() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/90" />
        <Dialog.Content aria-describedby={undefined}
          className="fixed inset-0 z-[60] flex flex-col focus:outline-none">
          <div className="flex items-center justify-between gap-2 px-4 py-3 text-white">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-medium">Evidência</Dialog.Title>
              {codigo && (
                <a href={`/verificar/${codigo}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-green-300 hover:underline" data-testid="codigo-verificacao">
                  <ShieldCheck size={12} /> Verificado · {formatarCodigo(codigo)}
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              {urlDownload ? (
                <a href={urlDownload} download
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 text-sm hover:bg-white/20 transition">
                  <Download size={15} /> Baixar
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-white/50">
                  <Loader2 size={15} className="animate-spin" /> Baixar
                </span>
              )}
              <Dialog.Close aria-label="Fechar"
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">
                <X size={18} />
              </Dialog.Close>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-2" onClick={onFechar}>
            {!url && <Loader2 size={24} className="animate-spin text-white/60" />}
            {url && (
              <img src={url} alt="Evidência em tela cheia" onClick={e => e.stopPropagation()}
                className="max-w-full max-h-full object-contain" />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
