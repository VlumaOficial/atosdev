import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Copy, ExternalLink, Headset, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// Menu "Portal do cliente" (administrador e gestor): explica o que é o portal, mostra o endereço que
// os clientes usam e se está tudo pronto para eles abrirem chamados, com atalhos para cada ajuste.
// (Antes o item abria só a "prévia" da identidade, sem dizer para que servia.)
const TIPOS = ['incidente', 'requisicao', 'visita', 'preventiva']

function Linha({ ok, titulo, detalhe, to, rotulo }: { ok: boolean; titulo: string; detalhe: string; to?: string; rotulo?: string }) {
  return (
    <li className="flex items-start gap-3 py-3" data-pronto={ok ? 'sim' : 'nao'}>
      {ok ? <CheckCircle2 size={18} className="text-green-400 flex-shrink-0 mt-0.5" /> : <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{titulo}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detalhe}</p>
      </div>
      {to && <Link to={to} className="text-xs text-primary hover:underline flex-shrink-0 mt-0.5">{rotulo ?? 'Abrir'}</Link>}
    </li>
  )
}

export default function PortalClientePage() {
  const { user, tenant } = useAuth()
  const admin = user?.role === 'admin'
  const [host, setHost] = useState<string | null | undefined>(undefined)
  const [clientes, setClientes] = useState<number | null>(null)
  const [pedidos, setPedidos] = useState<number | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    supabase.from('portal_enderecos').select('host, situacao, principal').eq('situacao', 'ativo').eq('principal', true).maybeSingle()
      .then(({ data }) => setHost((data as any)?.host ?? null))
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('portal_ativo', true).eq('active', true)
      .then(({ count }) => setClientes(count ?? 0))
    supabase.rpc('portal_solicitacoes_empresa').then(({ data }) => setPedidos(Array.isArray(data) ? data.length : 0))
  }, [])

  const ligado = !!tenant?.portal_ativo
  const tipos = tenant?.portal_abertura?.tipos ?? {}
  const nTipos = TIPOS.filter(t => tipos?.[t]?.ativo !== false).length
  const endereco = host ? `https://${host}` : tenant?.portal_slug ? `${window.location.origin}/portal/${tenant.portal_slug}` : null
  const pronto = ligado && (clientes ?? 0) > 0 && nTipos > 0

  async function copiar() {
    if (!endereco) return
    try { await navigator.clipboard.writeText(endereco); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sem permissão: o endereço continua visível */ }
  }

  return (
    <div className="max-w-3xl" data-testid="portal-cliente-pagina">
      <PageHeader title="Portal do cliente" description="O canal em que os clientes dos seus clientes abrem e acompanham chamados sozinhos, com a sua marca." />

      <Card className="p-5 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0"><Headset size={18} className="text-primary" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Endereço que os clientes usam</p>
            {endereco
              ? <p className="text-sm text-primary break-all mt-0.5" data-testid="portal-endereco">{endereco}</p>
              : <p className="text-xs text-muted-foreground mt-0.5">Ainda não há endereço. Defina o nome curto em Configurações › Portal de atendimento.</p>}
            <p className="text-xs mt-1">
              {ligado
                ? <span className="text-green-400">Portal ativo para os clientes</span>
                : <span className="text-amber-300">Em prévia: só a equipe da empresa consegue abrir. Ative em Configurações › Portal de atendimento.</span>}
            </p>
            {endereco && (
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={copiar} data-testid="copiar-endereco">{copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar endereço'}</Button>
                <a href={endereco} target="_blank" rel="noreferrer" data-testid="abrir-portal"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-foreground hover:bg-secondary"><ExternalLink size={14} /> Ver a tela de entrada do cliente</a>
              </div>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-4 border-t border-border pt-3">
          Você entra aqui com a conta da equipe, então não abre chamados pelo portal. Para ver o portal como o cliente vê, abra o endereço acima numa janela anônima
          e entre com a conta de um cliente (convide uma pessoa na aba Portal do cliente, em Clientes).
        </p>
      </Card>

      <Card className="p-5">
        <p className="text-sm font-medium text-foreground">{pronto ? 'Tudo pronto para os clientes abrirem chamados' : 'O que falta para os clientes abrirem chamados'}</p>
        <ul className="divide-y divide-border mt-1">
          <Linha ok={ligado} titulo="Portal ligado para os clientes" detalhe={ligado ? 'Os clientes conseguem entrar.' : 'Desligado: só a equipe da empresa abre (prévia).'} to={admin ? '/configuracoes?secao=portal' : undefined} rotulo="Ajustar" />
          <Linha ok={(clientes ?? 0) > 0} titulo={clientes === null ? 'Clientes com portal ligado' : `${clientes} cliente(s) com o portal ligado`} detalhe="Cada cliente é ligado na aba Portal, em Clientes, onde você também convida as pessoas dele." to="/clientes" rotulo="Clientes" />
          <Linha ok={nTipos > 0} titulo={`${nTipos} de 4 tipos de chamado liberados`} detalhe="Problema, solicitação, visita técnica e manutenção preventiva. Você escolhe quais o cliente vê e com que nome." to={admin ? '/configuracoes?secao=portal' : undefined} rotulo="Escolher tipos" />
          <Linha ok={(pedidos ?? 0) === 0} titulo={pedidos === null ? 'Pedidos de acesso' : pedidos === 0 ? 'Nenhum pedido de acesso esperando' : `${pedidos} pedido(s) de acesso esperando resposta`} detalhe="Pessoas que pediram acesso pela tela de entrada do portal." to={admin ? '/usuarios?aba=solicitacoes' : undefined} rotulo="Responder" />
        </ul>
      </Card>
    </div>
  )
}
