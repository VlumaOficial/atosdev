import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Crédito exigido pelos dados/provedor de endereços do carimbo:
// OpenStreetMap (licença ODbL) sempre; LocationIQ exige link visível
// "Search by LocationIQ.com" para uso comercial no plano gratuito.
let cache: string | null | undefined

export default function AtribuicaoMapas({ className = '' }: { className?: string }) {
  const [provedor, setProvedor] = useState<string | null | undefined>(cache)
  useEffect(() => {
    if (cache !== undefined) return
    supabase.rpc('provedor_geocodificacao').then(({ data }) => { cache = (data as string) ?? null; setProvedor(cache) })
  }, [])
  return (
    <p className={'text-[10px] text-muted-foreground ' + className} data-testid="atribuicao-mapas">
      Endereços: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:underline">© OpenStreetMap</a>
      {provedor === 'locationiq' && <> · <a href="https://locationiq.com" target="_blank" rel="noreferrer" className="hover:underline">Search by LocationIQ.com</a></>}
      {provedor === 'opencage' && <> · <a href="https://opencagedata.com" target="_blank" rel="noreferrer" className="hover:underline">OpenCage</a></>}
    </p>
  )
}
