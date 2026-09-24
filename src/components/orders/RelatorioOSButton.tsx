import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { FileText, Loader2, RefreshCw } from 'lucide-react'
import EnviarRelatorio from '@/components/orders/EnviarRelatorio'

// Relatório PDF da OS (Bloco C). Gerado no SERVIDOR automaticamente
// quando a OS é concluída (gatilho do banco). Aqui: baixar o gerado,
// acompanhar enquanto gera, e "Gerar relatório" como rede de segurança
// (OS concluída antes do recurso ou falha na geração).

interface Relatorio { id: string; versao: number; status: string; file_path: string | null; codigo: string | null; removido_em?: string | null }

export default function RelatorioOSButton({ orderId, numero, concluida, cliente = '' }: { orderId: string; numero: string; concluida: boolean; cliente?: string }) {
  const [rel, setRel] = useState<Relatorio | null | undefined>(undefined)
  const [acao, setAcao] = useState<'baixando' | 'gerando' | null>(null)
  const [erro, setErro] = useState('')
  const tentativasPoll = useRef(0)

  async function carregar() {
    const { data } = await supabase.from('order_reports').select('id, versao, status, file_path, codigo, removido_em')
      .eq('order_id', orderId).order('versao', { ascending: false }).limit(1).maybeSingle()
    setRel((data as Relatorio) ?? null)
    return data as Relatorio | null
  }

  useEffect(() => { if (concluida) carregar(); else setRel(null) }, [orderId, concluida]) // eslint-disable-line react-hooks/exhaustive-deps

  // enquanto o servidor gera, acompanha (até ~2 min)
  useEffect(() => {
    if (!rel || (rel.status !== 'pendente' && rel.status !== 'gerando')) { tentativasPoll.current = 0; return }
    if (tentativasPoll.current > 40) return
    const t = setTimeout(() => { tentativasPoll.current++; carregar() }, 3000)
    return () => clearTimeout(t)
  }, [rel]) // eslint-disable-line react-hooks/exhaustive-deps

  async function baixar() {
    if (!rel?.file_path) return
    setErro(''); setAcao('baixando')
    const { data, error } = await supabase.storage.from('evidencias').createSignedUrl(rel.file_path, 300, { download: `Relatorio_${numero}${rel.versao > 1 ? '_v' + rel.versao : ''}.pdf` })
    setAcao(null)
    if (error || !data?.signedUrl) { setErro('Não foi possível abrir o relatório.'); return }
    window.location.assign(data.signedUrl)
  }

  async function gerar() {
    setErro(''); setAcao('gerando')
    const { data, error } = await supabase.functions.invoke('gerar-relatorio-os', { body: { order_id: orderId } })
    setAcao(null)
    if (error || !(data as any)?.ok) setErro((data as any)?.erro ?? 'Não foi possível gerar o relatório.')
    await carregar()
  }

  if (!concluida || rel === undefined) return null
  const gerandoNoServidor = rel && (rel.status === 'pendente' || rel.status === 'gerando')
  const base = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition disabled:opacity-60'

  if (rel?.removido_em) {
    return <p className="text-sm text-muted-foreground" data-testid="relatorio-os">Relatório removido em {new Date(rel.removido_em).toLocaleDateString('pt-BR')} (liberar espaço). Se foi baixado antes, o código de verificação dele continua valendo.</p>
  }

  return (
    <div data-testid="relatorio-os">
      {rel?.status === 'gerado' ? (
        <button type="button" onClick={baixar} disabled={!!acao} className={base + ' bg-primary text-primary-foreground hover:opacity-90'}>
          {acao === 'baixando' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Relatório (PDF){rel.versao > 1 ? ` · v${rel.versao}` : ''}
        </button>
      ) : gerandoNoServidor && acao !== 'gerando' ? (
        <span className={base + ' border border-border text-muted-foreground'}><Loader2 size={15} className="animate-spin" /> Gerando relatório...</span>
      ) : (
        <button type="button" onClick={gerar} disabled={!!acao} className={base + ' border border-border text-foreground hover:bg-secondary'}>
          {acao === 'gerando' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {acao === 'gerando' ? 'Gerando relatório...' : 'Gerar relatório (PDF)'}
        </button>
      )}
      {rel?.status === 'gerado' && rel.codigo && <EnviarRelatorio orderId={orderId} numero={numero} codigo={rel.codigo} cliente={cliente} />}
      {rel?.status === 'falha' && !acao && <p className="text-xs text-amber-400 mt-1">A geração automática falhou — toque em "Gerar relatório".</p>}
      {erro && <p className="text-xs text-red-400 mt-1">{erro}</p>}
    </div>
  )
}
