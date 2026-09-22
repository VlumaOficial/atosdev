import { useState, useEffect, useRef } from 'react'
import { uploadEvidenciaChecklist, urlEvidencia, removerEvidencia } from '@/lib/uploadEvidencia'
import { obterLocalizacao, type ErroLocalizacao } from '@/lib/geolocation'
import { useLocationConsent } from '@/hooks/useLocationConsent'
import LocationConsentModal from '@/components/LocationConsentModal'
import { Camera, X, Loader2, MapPin, RotateCcw } from 'lucide-react'

interface Props {
  instanceId: string
  fieldId: string
  value: string | null           // path do arquivo no storage
  onChange: (path: string | null) => void
  readOnly?: boolean
}

const ERRO_LOCALIZACAO_MSG: Record<ErroLocalizacao, string> = {
  negado: 'Permissão de localização negada. Ative o GPS para o navegador/app e tente de novo.',
  indisponivel: 'Não foi possível obter sua localização. Verifique se o GPS está ligado.',
  timeout: 'A leitura da localização demorou demais. Tente de novo.',
  nao_suportado: 'Este dispositivo não tem suporte a geolocalização.',
}

export default function FotoEvidencia({ instanceId, fieldId, value, onChange, readOnly }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [arquivoPendente, setArquivoPendente] = useState<File | null>(null)
  const [consentModalAberto, setConsentModalAberto] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { aceito, loaded, aceitar } = useLocationConsent()

  useEffect(() => {
    let ativo = true
    if (value) {
      urlEvidencia(value).then(url => { if (ativo) setPreview(url) })
    } else {
      setPreview(null)
    }
    return () => { ativo = false }
  }, [value])

  async function processarArquivo(file: File) {
    setErro('')
    setEnviando(true)
    try {
      const resultado = await obterLocalizacao()
      if (resultado.erro) {
        setErro(ERRO_LOCALIZACAO_MSG[resultado.erro])
        setArquivoPendente(file)
        return
      }
      const res = await uploadEvidenciaChecklist(file, instanceId, fieldId, resultado.coords!)
      if (res.erro) {
        setErro(res.erro)
      } else {
        onChange(res.path)
        setArquivoPendente(null)
      }
    } catch {
      setErro('Falha ao enviar a foto.')
    } finally {
      setEnviando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!loaded) return
    if (!aceito) {
      setArquivoPendente(file)
      setConsentModalAberto(true)
      return
    }
    await processarArquivo(file)
  }

  async function handleAceitarConsentimento() {
    setConsentModalAberto(false)
    await aceitar()
    if (arquivoPendente) await processarArquivo(arquivoPendente)
  }

  function handleCancelarConsentimento() {
    setConsentModalAberto(false)
    setArquivoPendente(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleTentarNovamente() {
    if (arquivoPendente) await processarArquivo(arquivoPendente)
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
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleArquivo} className="hidden" id={'foto-' + fieldId} />
      <label htmlFor={'foto-' + fieldId}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition cursor-pointer">
        {enviando ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
        {enviando ? 'Enviando...' : 'Anexar foto'}
      </label>
      {erro && (
        <div className="mt-1.5">
          <p className="text-xs text-red-400 flex items-start gap-1"><MapPin size={12} className="flex-shrink-0 mt-0.5" /> {erro}</p>
          {arquivoPendente && (
            <button type="button" onClick={handleTentarNovamente} disabled={enviando}
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
              <RotateCcw size={11} /> Tentar novamente
            </button>
          )}
        </div>
      )}
      <LocationConsentModal open={consentModalAberto} onAceitar={handleAceitarConsentimento} onCancelar={handleCancelarConsentimento} />
    </div>
  )
}
