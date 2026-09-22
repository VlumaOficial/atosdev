import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { uploadLogoEmpresa, urlLogoEmpresa } from '@/lib/uploadLogo'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { PenTool, Image as ImageIcon, Loader2 } from 'lucide-react'

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

  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoLoading, setLogoLoading] = useState(true)
  const [logoEnviando, setLogoEnviando] = useState(false)
  const [logoErro, setLogoErro] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    urlLogoEmpresa().then(url => { setLogoUrl(url); setLogoLoading(false) })
  }, [])

  async function handleLogoArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoErro('')
    setLogoEnviando(true)
    try {
      const res = await uploadLogoEmpresa(file)
      if (res.erro) {
        setLogoErro(res.erro)
      } else {
        const url = await urlLogoEmpresa()
        setLogoUrl(url)
      }
    } catch {
      setLogoErro('Não foi possível enviar a logo.')
    } finally {
      setLogoEnviando(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  return (
    <div>
      <PageHeader title="Configurações" description="Preferências da sua empresa no ATOS" />

      <div className="space-y-4 max-w-xl">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <ImageIcon size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Marca da empresa</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Aparece no carimbo das fotos de evidência coletadas em campo.
              </p>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-md border border-border bg-secondary/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {logoLoading ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> :
                    logoUrl ? <img src={logoUrl} alt="Logo da empresa" className="w-full h-full object-contain" /> :
                    <ImageIcon size={18} className="text-muted-foreground" />}
                </div>
                <div>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoArquivo} className="hidden" id="logo-upload" />
                  <label htmlFor="logo-upload"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-transparent text-sm text-foreground hover:bg-secondary transition cursor-pointer">
                    {logoEnviando && <Loader2 size={14} className="animate-spin" />}
                    {logoUrl ? 'Trocar logo' : 'Enviar logo'}
                  </label>
                </div>
              </div>
              {logoErro && <p className="text-xs text-red-400 mt-2">{logoErro}</p>}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <PenTool size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Exigir assinatura do cliente para concluir OS</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quando ligado, o técnico não consegue concluir uma ordem de serviço sem antes coletar a assinatura do cliente. Pode ser sobrescrito por OS individual.
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
    </div>
  )
}
