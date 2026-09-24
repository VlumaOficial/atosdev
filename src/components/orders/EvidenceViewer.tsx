import { useState, useEffect, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Download, Loader2, ShieldCheck, ShieldAlert, Share2, ExternalLink, Check } from 'lucide-react'
import { urlDownloadEvidencia, urlEvidencia, codigoDaFoto, formatarCodigo } from '@/lib/uploadEvidencia'
import { consultarVerificacao, linkVerificacao, type ResultadoVerificacao } from '@/lib/verificacao'

// Foto de evidência em tela cheia (sem recorte — o carimbo fica sempre
// visível) + download do arquivo carimbado. Dialog do Radix pelo mesmo
// motivo do CameraCaptura: também é aberto de dentro do modal do checklist.
//
// Verificação DENTRO do visualizador (bug 2026-09-23, celular real): o
// link abria nova aba; ao voltar, o Android fechava o visualizador e o
// código não reaparecia até recarregar. Agora nada sai da tela: o selo
// abre um painel com o resultado + "Compartilhar link" (share nativo) e a
// página pública fica como opção secundária.
interface Props {
  path: string | null
  onFechar: () => void
}

function dataHora(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

// A foto CHEIA só é baixada aqui (ao abrir) — listas usam a miniatura
export default function EvidenceViewer({ path, onFechar }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [urlDownload, setUrlDownload] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [painel, setPainel] = useState(false)
  const [verif, setVerif] = useState<ResultadoVerificacao | null>(null)
  const [copiado, setCopiado] = useState(false)

  // busca o código com nova tentativa — uma falha momentânea (ex.: logo
  // que o celular devolve a aba) não pode sumir com o selo
  const buscarCodigo = useCallback(async (p: string, ativo: () => boolean) => {
    for (let tentativa = 0; tentativa < 3 && ativo(); tentativa++) {
      const c = await codigoDaFoto(p).catch(() => undefined)
      if (c !== undefined) { if (ativo()) setCodigo(c); return }
      await new Promise(r => setTimeout(r, 800))
    }
  }, [])

  useEffect(() => {
    let ativo = true
    const estaAtivo = () => ativo
    setUrl(null); setUrlDownload(null); setCodigo(null); setPainel(false); setVerif(null)
    if (path) {
      buscarCodigo(path, estaAtivo)
      urlEvidencia(path).then(u => { if (ativo) setUrl(u) })
      urlDownloadEvidencia(path).then(u => { if (ativo) setUrlDownload(u) })
      // voltou pro app com o visualizador aberto: garante o selo
      const aoVoltar = () => { if (document.visibilityState === 'visible') buscarCodigo(path, estaAtivo) }
      document.addEventListener('visibilitychange', aoVoltar)
      return () => { ativo = false; document.removeEventListener('visibilitychange', aoVoltar) }
    }
    return () => { ativo = false }
  }, [path, buscarCodigo])

  async function abrirPainel() {
    if (!codigo) return
    const abrir = !painel
    setPainel(abrir)
    if (abrir && !verif) setVerif(await consultarVerificacao(codigo))
  }

  async function compartilhar() {
    if (!codigo) return
    const link = linkVerificacao(codigo)
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    if (nav.share) {
      try { await nav.share({ title: 'Verificação de foto ATOS', text: `Confira a autenticidade da foto (código ${formatarCodigo(codigo)}):`, url: link }); return } catch { /* cancelou: cai pra copiar */ }
    }
    try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem clipboard */ }
  }

  return (
    <Dialog.Root open={!!path} onOpenChange={(o) => { if (!o) onFechar() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black" />
        <Dialog.Content aria-describedby={undefined}
          // trocar de app/janela no celular não pode fechar o visualizador
          onFocusOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
          className="fixed inset-0 z-[60] flex flex-col focus:outline-none">
          <div className="flex items-center justify-between gap-2 px-4 py-3 text-white">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-medium">Evidência</Dialog.Title>
              {codigo && (
                <button type="button" onClick={abrirPainel} aria-expanded={painel}
                  className="inline-flex items-center gap-1 text-[11px] text-green-300 hover:underline" data-testid="codigo-verificacao">
                  <ShieldCheck size={12} /> Verificado · {formatarCodigo(codigo)}
                </button>
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

          {painel && codigo && (
            <div className="mx-4 mb-2 rounded-lg bg-white/10 text-white p-3 text-xs space-y-2" data-testid="painel-verificacao">
              {!verif && <div className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Verificando...</div>}
              {verif && (
                verif.encontrado && verif.integra
                  ? <div className="flex items-start gap-2 text-green-300"><ShieldCheck size={16} className="flex-shrink-0" />
                      <span><strong>Foto autêntica</strong> — idêntica à enviada. Recebida pelo servidor em {dataHora(verif.enviado_em)}.</span></div>
                  : <div className="flex items-start gap-2 text-amber-300"><ShieldAlert size={16} className="flex-shrink-0" />
                      <span>{!verif.encontrado ? 'Não foi possível verificar agora. Tente de novo.' : !verif.arquivo_disponivel ? 'O arquivo não está mais armazenado.' : 'Atenção: o arquivo guardado não corresponde ao enviado.'}</span></div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={compartilhar}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/15 hover:bg-white/25">
                  {copiado ? <Check size={13} /> : <Share2 size={13} />} {copiado ? 'Link copiado' : 'Compartilhar link'}
                </button>
                <a href={linkVerificacao(codigo)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-white/70 hover:text-white">
                  <ExternalLink size={13} /> Abrir página pública
                </a>
              </div>
            </div>
          )}

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
