import { useEffect, useState } from 'react'
import { Loader2, Headset } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import GestaoPortalCliente from './GestaoPortalCliente'

// Aba "Portal" do cadastro do Cliente (equipe interna): liga o portal do cliente e
// gerencia, em nome dele, as pessoas, os convites, as equipes e os pedidos de acesso.
export default function ClientePortalAba({ clientId, nomeCliente }: { clientId: string; nomeCliente: string }) {
  const { tenant } = useAuth()
  const [ativo, setAtivo] = useState<boolean | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('clients').select('portal_ativo').eq('id', clientId).single().then(({ data }) => setAtivo(!!data?.portal_ativo))
  }, [clientId])

  async function alternar() {
    setErro(''); setSalvando(true)
    const { error } = await supabase.rpc('definir_portal_cliente', { p_client: clientId, p_ativo: !ativo })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setAtivo(!ativo)
  }

  if (!tenant?.portal_habilitado) return <p className="text-sm text-muted-foreground" data-testid="portal-nao-habilitado">O portal de atendimento ainda não está habilitado para a sua empresa.</p>
  if (!tenant.portal_ativo) return <p className="text-sm text-amber-300" data-testid="portal-empresa-inativo">O portal da empresa ainda não está ativo. Configure e ative em Configurações › Portal de atendimento.</p>
  if (ativo === null) return <Loader2 className="animate-spin text-muted-foreground" size={18} />

  return (
    <div className="space-y-5" data-testid="aba-portal">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
        <div className="flex items-start gap-3">
          <Headset size={18} className="text-primary mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Portal liberado para {nomeCliente}</p>
            <p className="text-xs text-muted-foreground">Ligado, as pessoas deste cliente podem abrir e acompanhar chamados pelo portal da sua empresa.</p>
          </div>
        </div>
        <button type="button" role="switch" aria-checked={ativo} aria-label="Portal liberado para este cliente" onClick={alternar} disabled={salvando} data-testid="toggle-portal-cliente"
          className={'relative w-11 h-6 rounded-full transition flex-shrink-0 ' + (ativo ? 'bg-primary' : 'bg-secondary border border-border')}>
          <span className={'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ' + (ativo ? 'left-[22px]' : 'left-0.5')} />
        </button>
      </div>
      {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
      {ativo
        ? <GestaoPortalCliente clientId={clientId} />
        : <p className="text-xs text-muted-foreground">Ligue o portal para convidar pessoas deste cliente.</p>}
    </div>
  )
}
