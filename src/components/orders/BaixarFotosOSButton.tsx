import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Download, Loader2 } from 'lucide-react'
import { listarFotosParaExportar, gerarZip, nomeDoZip } from '@/lib/exportacaoFotos'

// "Baixar fotos" de UMA OS em ZIP (evidências + fotos do checklist +
// assinatura). Mesmo mecanismo da exportação em Configurações.
export default function BaixarFotosOSButton({ orderId, numero }: { orderId: string; numero: string }) {
  const { tenant } = useAuth()
  const [estado, setEstado] = useState<string | null>(null)

  async function baixar() {
    setEstado('Preparando...')
    try {
      const itens = await listarFotosParaExportar({ orderId })
      if (!itens.length) { setEstado('Sem fotos'); setTimeout(() => setEstado(null), 2500); return }
      await gerarZip(itens, nomeDoZip(tenant?.name ?? 'empresa', undefined, undefined, numero),
        p => setEstado(`${p.baixadas}/${p.total}`))
      setEstado(null)
    } catch {
      setEstado('Falhou')
      setTimeout(() => setEstado(null), 3000)
    }
  }

  const ocupado = !!estado && estado !== 'Sem fotos' && estado !== 'Falhou'
  return (
    <button type="button" onClick={baixar} disabled={ocupado}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition disabled:opacity-60">
      {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {estado ?? 'Baixar fotos (ZIP)'}
    </button>
  )
}
