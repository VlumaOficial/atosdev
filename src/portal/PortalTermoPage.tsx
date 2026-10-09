import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePortal } from './PortalContext'
import { MarcaPortal, RodapePortal } from './PortalLayout'

// Leitura pública dos termos vigentes (transparência LGPD: o aviso de
// privacidade pode ser lido antes de entrar)
export default function PortalTermoPage() {
  const { tipo } = useParams()
  const { id, base } = usePortal()
  const [termo, setTermo] = useState<{ titulo: string; versao: number; texto: string } | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    setCarregando(true)
    supabase.rpc('portal_termo_texto', { p_slug: id.slug, p_tipo: tipo }).then(({ data }) => {
      setTermo(data as any)
      setCarregando(false)
    })
  }, [id.slug, tipo])

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <MarcaPortal />
          <Link to={base || '/'} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft size={14} /> Voltar</Link>
        </div>
        {carregando ? <Loader2 className="animate-spin text-muted-foreground mx-auto" /> : !termo ? (
          <p className="text-sm text-muted-foreground">Documento não encontrado.</p>
        ) : (
          <article className="vluma-card p-5" data-testid="portal-termo">
            <h1 className="text-lg font-bold text-foreground">{termo.titulo}</h1>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">Versão {termo.versao}</p>
            {termo.texto.split(/\n{2,}/).map((p, i) => <p key={i} className="text-sm text-foreground/90 leading-relaxed mb-3 whitespace-pre-line">{p}</p>)}
          </article>
        )}
        <RodapePortal />
      </div>
    </div>
  )
}
