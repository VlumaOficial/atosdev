import { useEffect, useState } from 'react'
import { Mic, Image as ImageIcon, Loader2 } from 'lucide-react'
import { urlAssinada, type AnexoChamado } from '@/lib/portalChamados'

// Fotos e áudios que o cliente enviou no chamado (portal, equipe interna e técnico)
export default function AnexosCliente({ anexos }: { anexos: AnexoChamado[] }) {
  const [urls, setUrls] = useState<Record<string, string | null>>({})
  useEffect(() => {
    let vivo = true
    Promise.all(anexos.map(async a => [a.id, await urlAssinada(a.path)] as const)).then(r => { if (vivo) setUrls(Object.fromEntries(r)) })
    return () => { vivo = false }
  }, [anexos])
  if (anexos.length === 0) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="anexos-cliente">
      {anexos.map(a => {
        const u = urls[a.id]
        return a.tipo === 'foto' ? (
          <a key={a.id} href={u ?? undefined} target="_blank" rel="noreferrer" data-anexo={a.nome}
            className="block aspect-square rounded-md overflow-hidden border border-border bg-secondary/40">
            {u ? <img src={u} alt={a.nome} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>}
          </a>
        ) : (
          <div key={a.id} className="col-span-2 sm:col-span-3 rounded-md border border-border p-2.5" data-anexo={a.nome}>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 mb-1.5"><Mic size={12} /> Áudio do cliente</p>
            {u ? <audio controls src={u} className="w-full" preload="metadata" /> : <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          </div>
        )
      })}
    </div>
  )
}
export { ImageIcon }
