import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Check, AlertTriangle, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

// Endereço automático do portal (Edge Function portal-endereco): mostra o
// endereço da empresa, em que etapa está (DNS → certificado → ativo) e
// acompanha sozinho até ficar pronto.

interface Endereco { id: string; host: string; tipo: string; situacao: string; principal: boolean }

const ETAPA: Record<string, string> = {
  pendente: 'Preparando…',
  aguardando_dns: 'Aguardando o DNS propagar',
  verificando: 'Emitindo o certificado de segurança',
  ativo: 'Ativo',
  erro: 'Com erro',
}

async function mensagemDoErro(error: any): Promise<string> {
  try {
    const corpo = await error.context?.json?.()
    if (corpo?.error) return corpo.error
  } catch { /* sem corpo */ }
  return error?.message ?? 'Não foi possível falar com o servidor.'
}

export default function EnderecosPortal({ tenantId, slug, linkInterno }: { tenantId: string; slug: string | null | undefined; linkInterno: string }) {
  const [lista, setLista] = useState<Endereco[]>([])
  const [plat, setPlat] = useState<{ dominio_base: string | null; prefixo: string } | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('portal_enderecos').select('id, host, tipo, situacao, principal')
      .neq('situacao', 'removido').order('criado_em', { ascending: false })
    setLista((data ?? []) as Endereco[])
  }, [])

  const chamar = useCallback(async (acao: 'sincronizar' | 'verificar') => {
    setOcupado(true)
    const { data, error } = await supabase.functions.invoke('portal-endereco', { body: { acao, tenant_id: tenantId } })
    setOcupado(false)
    if (error) setErro(await mensagemDoErro(error))
    else if (data?.error) setErro(data.error)
    else if (data?.motivo === 'host_em_uso') setErro('Este endereço já está em uso por outra empresa. Escolha outro nome curto.')
    else setErro('')
    await carregar()
  }, [tenantId, carregar])

  useEffect(() => {
    carregar()
    supabase.rpc('portal_config_plataforma').then(({ data }) => setPlat(data as any))
  }, [carregar])

  // com nome curto e domínio da plataforma definidos, garante o endereço
  useEffect(() => { if (slug && plat?.dominio_base) chamar('sincronizar') }, [slug, plat?.dominio_base]) // eslint-disable-line react-hooks/exhaustive-deps

  // acompanha enquanto algum endereço não estiver ativo
  const pendente = lista.some(e => e.situacao !== 'ativo' && e.situacao !== 'erro')
  useEffect(() => {
    if (!pendente) return
    const t = setInterval(() => chamar('verificar'), 10000)
    return () => clearInterval(t)
  }, [pendente, chamar])

  const dominio = plat?.dominio_base
  const previsto = slug && dominio ? `${plat?.prefixo}.${slug}.${dominio}` : null
  const oficial = lista.find(e => e.principal && e.situacao === 'ativo')

  return (
    <div className="mt-3 rounded-md border border-border p-3 space-y-2" data-testid="portal-enderecos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Endereço do portal para os seus clientes</p>
        {previsto && (
          <Button variant="outline" size="sm" loading={ocupado} onClick={() => chamar('verificar')}><RefreshCw size={13} /> Verificar agora</Button>
        )}
      </div>

      {!dominio ? (
        <p className="text-[11px] text-muted-foreground">O endereço será criado automaticamente assim que a VLUMA concluir a configuração do domínio. O portal já pode ser conferido pelo endereço de prévia abaixo.</p>
      ) : !slug ? (
        <p className="text-[11px] text-muted-foreground">Salve o nome curto para criar o endereço.</p>
      ) : lista.length === 0 ? (
        <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Criando <span className="text-foreground">{previsto}</span>…</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map(e => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]" data-endereco={e.host} data-situacao={e.situacao}>
              {e.situacao === 'ativo' ? <Check size={13} className="text-green-400" />
                : e.situacao === 'erro' ? <AlertTriangle size={13} className="text-red-400" />
                : <Loader2 size={13} className="animate-spin text-amber-300" />}
              {e.situacao === 'ativo'
                ? <a href={`https://${e.host}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{e.host} <ExternalLink size={11} /></a>
                : <span className="text-foreground">{e.host}</span>}
              <span className="text-muted-foreground">· {ETAPA[e.situacao] ?? e.situacao}{e.principal ? '' : ' (endereço antigo)'}</span>
            </li>
          ))}
        </ul>
      )}
      {erro && <p className="text-[11px] text-red-400" role="alert">{erro}</p>}
      {previsto && !oficial && lista.some(e => e.situacao !== 'ativo') && (
        <p className="text-[11px] text-muted-foreground">Costuma levar de 1 a 3 minutos. Esta tela acompanha sozinha.</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Prévia da equipe (clientes são levados ao endereço oficial): <a href={linkInterno} target="_blank" rel="noreferrer" className="text-primary hover:underline">{linkInterno}</a>
      </p>
    </div>
  )
}
