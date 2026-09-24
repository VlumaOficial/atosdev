import { useState, useEffect } from 'react'
import { useOrderEvidences, type OrderEvidence } from '@/hooks/useOrderEvidences'
import { urlMiniaturaEvidencia } from '@/lib/uploadEvidencia'
import { obterLocalizacao, type ErroLocalizacao } from '@/lib/geolocation'
import { useLocationConsent } from '@/hooks/useLocationConsent'
import LocationConsentModal from '@/components/LocationConsentModal'
import CameraCaptura from '@/components/orders/CameraCaptura'
import EvidenceViewer from '@/components/orders/EvidenceViewer'
import { useFotoAberta } from '@/hooks/useFotoAberta'
import { useTrabalhoPendente } from '@/lib/trabalhoPendente'
import { X, Loader2, MapPin, RotateCcw, Image as ImageIcon } from 'lucide-react'

const ERRO_LOCALIZACAO_MSG: Record<ErroLocalizacao, string> = {
  negado: 'Permissão de localização negada. Ative o GPS para o navegador/app e tente de novo.',
  indisponivel: 'Não foi possível obter sua localização. Verifique se o GPS está ligado.',
  timeout: 'A leitura da localização demorou demais. Tente de novo.',
  nao_suportado: 'Este dispositivo não tem suporte a geolocalização.',
}

function EvidenceCard({ evidencia, readOnly, onRemover, onSalvarObservacao }: {
  evidencia: OrderEvidence
  readOnly?: boolean
  onRemover: () => void
  onSalvarObservacao: (texto: string) => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [texto, setTexto] = useState(evidencia.observacao ?? '')
  const foto = useFotoAberta(evidencia.file_path)

  useEffect(() => {
    let ativo = true
    if (!evidencia.arquivo_removido_em) urlMiniaturaEvidencia(evidencia.file_path).then(url => { if (ativo) setPreview(url) })
    return () => { ativo = false }
  }, [evidencia.file_path])

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="relative bg-black/20">
        {evidencia.arquivo_removido_em
          ? <div className="w-full h-40 flex flex-col items-center justify-center text-center px-2 text-[11px] text-muted-foreground" data-testid="foto-removida">
              Foto removida em {new Date(evidencia.arquivo_removido_em).toLocaleDateString('pt-BR')}<br />(está no relatório PDF da OS)
            </div>
          : preview
          ? (
            <button type="button" onClick={foto.abrir} className="block w-full" aria-label="Ver evidência em tela cheia">
              {/* object-contain: a foto inteira aparece (retrato ou paisagem) — com object-cover o carimbo sumia em foto retrato */}
              <img src={preview} alt="Evidência" className="w-full h-40 object-contain" />
            </button>
          )
          : <div className="w-full h-40 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>}
        {!readOnly && (
          <button type="button" onClick={onRemover}
            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-red-500/80 transition">
            <X size={14} />
          </button>
        )}
      </div>
      <EvidenceViewer path={foto.aberta ? evidencia.file_path : null} onFechar={foto.fechar} />
      <div className="p-2">
        {readOnly ? (
          texto && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{texto}</p>
        ) : (
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onBlur={() => { if (texto !== (evidencia.observacao ?? '')) onSalvarObservacao(texto) }}
            placeholder="Observação (opcional)"
            rows={2}
            className="w-full px-2 py-1.5 rounded-md bg-input border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none"
          />
        )}
      </div>
    </div>
  )
}

export default function OrderEvidences({ orderId, readOnly }: { orderId: string; readOnly?: boolean }) {
  const { evidencias, loading, adicionar, atualizarObservacao, remover } = useOrderEvidences(orderId)
  const { aceito, termoAtualizado, loaded, aceitar } = useLocationConsent()
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [arquivoPendente, setArquivoPendente] = useState<File | null>(null)
  const [consentModalAberto, setConsentModalAberto] = useState(false)
  const [cameraAberta, setCameraAberta] = useState(false)
  useTrabalhoPendente(enviando)

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
      await adicionar(file, resultado.coords!)
      setArquivoPendente(null)
    } catch (e: any) {
      setErro((e?.message ?? 'Falha ao enviar a foto.') + ' Verifique a conexão e tente de novo.')
      setArquivoPendente(file)
    } finally {
      setEnviando(false)
    }
  }

  // Consentimento de localização vem ANTES de abrir a câmera, pra não
  // tirar a foto e só depois descobrir que não pode carimbar
  function handleAbrirCamera() {
    if (!loaded || enviando) return
    if (!aceito) {
      setConsentModalAberto(true)
      return
    }
    setCameraAberta(true)
  }

  async function handleFotoCapturada(file: File) {
    setCameraAberta(false)
    await processarArquivo(file)
  }

  async function handleAceitarConsentimento() {
    setConsentModalAberto(false)
    await aceitar()
    setCameraAberta(true)
  }

  function handleCancelarConsentimento() {
    setConsentModalAberto(false)
  }

  async function handleTentarNovamente() {
    if (arquivoPendente) await processarArquivo(arquivoPendente)
  }

  async function handleRemover(ev: OrderEvidence) {
    if (!confirm('Remover esta evidência?')) return
    try {
      await remover(ev.id, ev.file_path)
    } catch {
      alert('Não foi possível remover a evidência.')
    }
  }

  if (loading) return <p className="text-xs text-muted-foreground">Carregando evidências...</p>

  return (
    <div>
      {evidencias.length === 0 && readOnly && (
        <p className="text-sm text-muted-foreground text-center py-2">Nenhuma evidência anexada.</p>
      )}

      {evidencias.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {evidencias.map(ev => (
            <EvidenceCard
              key={ev.id}
              evidencia={ev}
              readOnly={readOnly}
              onRemover={() => handleRemover(ev)}
              onSalvarObservacao={(texto) => atualizarObservacao(ev.id, texto)}
            />
          ))}
        </div>
      )}

      {!readOnly && (
        <div>
          <button type="button" onClick={handleAbrirCamera} disabled={enviando}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition disabled:opacity-60">
            {enviando ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
            {enviando ? 'Enviando...' : 'Adicionar evidência'}
          </button>
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
        </div>
      )}

      <LocationConsentModal open={consentModalAberto} termoAtualizado={termoAtualizado} onAceitar={handleAceitarConsentimento} onCancelar={handleCancelarConsentimento} />
      <CameraCaptura open={cameraAberta} onCapturar={handleFotoCapturada} onFechar={() => setCameraAberta(false)} />
    </div>
  )
}
