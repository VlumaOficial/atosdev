import { useEffect, useState } from 'react'
import { urlAssinatura } from '@/lib/uploadSignature'
import { AlertTriangle } from 'lucide-react'

// Exibição (somente leitura) das assinaturas da OS no corpo da OS —
// técnico e admin. A captura acontece no modal "Concluir atendimento".

interface OrderAss {
  status: string
  signature_path: string | null
  signer_name: string | null
  signed_at?: string | null
  signature_absent_reason?: string | null
  technician_signature_path?: string | null
  technician_signer_name?: string | null
  technician_signed_at?: string | null
}

function fmt(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
}

function Assinatura({ path, titulo, nome, quando }: { path: string; titulo: string; nome?: string | null; quando?: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let a = true; urlAssinatura(path).then(u => { if (a) setUrl(u) }); return () => { a = false } }, [path])
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{titulo}</p>
      {url && <img src={url} alt={titulo} className="max-h-24 rounded-md border border-border bg-white" />}
      <p className="text-xs text-muted-foreground mt-1">{nome}{quando ? ` · ${fmt(quando)}` : ''}</p>
    </div>
  )
}

export default function AssinaturasDaOS({ order, exige }: { order: OrderAss; exige: boolean }) {
  const nada = !order.signature_path && !order.technician_signature_path && !order.signature_absent_reason
  if (nada) {
    if (order.status === 'concluida' || order.status === 'cancelada') return <p className="text-sm text-muted-foreground">Sem assinaturas.</p>
    return (
      <p className="text-sm text-muted-foreground">
        As assinaturas são coletadas ao <strong className="text-foreground">concluir o atendimento</strong>.
        {exige && <span className="block text-xs text-amber-400 mt-1">A assinatura do cliente é obrigatória nesta OS.</span>}
      </p>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="assinaturas-os">
      {order.signature_path
        ? <Assinatura path={order.signature_path} titulo="Cliente" nome={order.signer_name} quando={order.signed_at} />
        : order.signature_absent_reason && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md p-3">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={13} /> Cliente não assinou</p>
            <p className="mt-1 whitespace-pre-wrap">Motivo: {order.signature_absent_reason}</p>
          </div>
        )}
      {order.technician_signature_path && (
        <Assinatura path={order.technician_signature_path} titulo="Responsável" nome={order.technician_signer_name} quando={order.technician_signed_at} />
      )}
    </div>
  )
}
