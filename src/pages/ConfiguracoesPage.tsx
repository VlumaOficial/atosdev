import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { PenTool } from 'lucide-react'

export default function ConfiguracoesPage() {
  const { tenant, refreshTenant } = useAuth()
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function alternarAssinaturaObrigatoria(valor: boolean) {
    if (!tenant) return
    setSaving(true)
    setErro('')
    try {
      const { error } = await supabase.rpc('atualizar_config_tenant', { p_require_signature: valor })
      if (error) throw error
      await refreshTenant()
    } catch (err: any) {
      setErro(err?.message ?? 'Não foi possível salvar a configuração.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Configurações" description="Preferências da sua empresa no ATOS" />

      <Card className="p-5 max-w-xl">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <PenTool size={16} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Exigir assinatura do cliente para concluir OS</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Quando ligado, o técnico não consegue concluir uma ordem de serviço sem antes coletar a assinatura do cliente.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!tenant?.require_signature_to_complete}
            disabled={saving || !tenant}
            onClick={() => alternarAssinaturaObrigatoria(!tenant?.require_signature_to_complete)}
            className={
              'flex-shrink-0 w-11 h-6 rounded-full transition relative disabled:opacity-50 ' +
              (tenant?.require_signature_to_complete ? 'bg-primary' : 'bg-secondary')
            }
          >
            <span className={'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ' + (tenant?.require_signature_to_complete ? 'left-5' : 'left-0.5')} />
          </button>
        </div>
        {erro && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mt-3">{erro}</div>}
      </Card>
    </div>
  )
}
