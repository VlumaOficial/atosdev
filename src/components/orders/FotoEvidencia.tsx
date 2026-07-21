import { useState, useEffect, useRef } from 'react'
import { uploadEvidenciaChecklist, urlEvidencia, removerEvidencia } from '@/lib/uploadEvidencia'
import { Camera, X, Loader2 } from 'lucide-react'

interface Props {
  instanceId: string
  fieldId: string
  value: string | null           // path do arquivo no storage
  onChange: (path: string | null) => void
  readOnly?: boolean
}

export default function FotoEvidencia({ instanceId, fieldId, value, onChange, readOnly }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // carrega a URL assinada quando ja existe foto
  useEffect(() => {
    let ativo = true
    if (value) {
      urlEvidencia(value).then(url => { if (ativo) setPreview(url) })
    } else {
      setPreview(null)
    }
    return () => { ativo = false }
  }, [value])

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErro('')
    setEnviando(true)
    try {
      const res = await uploadEvidenciaChecklist(file, instanceId, fieldId)
      if (res.erro) {
        setErro(res.erro)
      } else {
        onChange(res.path)
      }
    } catch {
      setErro('Falha ao enviar a foto.')
    } finally {
      setEnviando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemover() {
    if (!value) return
    if (!confirm('Remover esta foto?')) return
    await removerEvidencia(value)
    onChange(null)
  }

  if (preview) {
    return (
      <div className="relative inline-block">
        <img src={preview} alt="Evidência" className="max-h-48 rounded-md border border-border" />
        {!readOnly && (
          <button type="button" onClick={handleRemover}
            className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-red-500/80 transition">
            <X size={14} />
          </button>
        )}
      </div>
    )
  }

  if (readOnly) {
    return <p className="text-xs text-muted-foreground italic">Sem foto.</p>
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleArquivo} className="hidden" id={'foto-' + fieldId} />
      <label htmlFor={'foto-' + fieldId}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition cursor-pointer">
        {enviando ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
        {enviando ? 'Enviando...' : 'Anexar foto'}
      </label>
      {erro && <p className="text-xs text-red-400 mt-1">{erro}</p>}
    </div>
  )
}
