import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { SecaoRecolhivel } from '@/components/ui/secao-recolhivel'
import { Stamp, RotateCcw } from 'lucide-react'
import { desenharCarimbo } from '@/lib/uploadEvidencia'
import {
  CAMPOS_CARIMBO, resolverConfigCarimbo, diferencasDoPadrao,
  type CampoCarimbo, type ConfigCarimbo,
} from '@/lib/carimboConfig'

// Configuração dos campos do carimbo (Incremento 3 do carimbo v2) com
// prévia ao vivo — a prévia usa a MESMA função desenharCarimbo() do
// upload real, então o que o admin vê é exatamente o que sai na foto.

const EXEMPLO = {
  coords: { lat: -12.963623, lng: -38.471754, accuracy: null },
  endereco: 'Rua Silveira Martins - Cabula, Salvador - BA, 41150-000',
  numeroOs: 'OS-0012',
  unidade: 'Loja 53 - Passé',
}

function fundoExemplo(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // "foto" neutra: parede clara em cima, piso de madeira embaixo — fundo
  // claro de propósito, pra mostrar a legibilidade no pior caso
  const parede = ctx.createLinearGradient(0, 0, 0, h * 0.45)
  parede.addColorStop(0, '#dfe3e8'); parede.addColorStop(1, '#c9ced6')
  ctx.fillStyle = parede; ctx.fillRect(0, 0, w, h * 0.45)
  const piso = ctx.createLinearGradient(0, h * 0.45, 0, h)
  piso.addColorStop(0, '#e6cfa3'); piso.addColorStop(1, '#cfb07c')
  ctx.fillStyle = piso; ctx.fillRect(0, h * 0.45, w, h * 0.55)
}

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

export default function CarimboConfigCard({ logoUrl }: { logoUrl: string | null }) {
  const { user, tenant, refreshTenant } = useAuth()
  const [config, setConfig] = useState<ConfigCarimbo>(() => resolverConfigCarimbo(tenant?.stamp_config))
  const [orientacao, setOrientacao] = useState<'retrato' | 'paisagem'>('retrato')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  // ref por estado (e não useRef): a seção abre fechada e o canvas só
  // existe depois de expandir — o desenho precisa rodar quando ele monta
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)

  useEffect(() => { setConfig(resolverConfigCarimbo(tenant?.stamp_config)) }, [tenant?.stamp_config])

  useEffect(() => {
    let ativo = true
    if (!logoUrl) { setLogo(null); return }
    carregarImagem(logoUrl).then(img => { if (ativo) setLogo(img) }).catch(() => { if (ativo) setLogo(null) })
    return () => { ativo = false }
  }, [logoUrl])

  useEffect(() => {
    if (!canvas) return
    const [w, h] = orientacao === 'retrato' ? [900, 1600] : [1600, 900]
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    fundoExemplo(ctx, w, h)
    desenharCarimbo(ctx, w, h, {
      tenantName: tenant?.name ?? 'Sua empresa',
      logoUrl,
      coords: EXEMPLO.coords,
      endereco: EXEMPLO.endereco,
      config,
      contexto: { numeroOs: EXEMPLO.numeroOs, unidade: EXEMPLO.unidade, tecnico: user?.name ?? 'Nome do Técnico' },
    }, logo, new Date())
  }, [canvas, config, orientacao, logo, logoUrl, tenant?.name, user])

  async function salvar(novo: ConfigCarimbo) {
    const anterior = config
    setConfig(novo)
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase.rpc('atualizar_carimbo_tenant', { p_config: diferencasDoPadrao(novo) })
      if (error) throw error
      await refreshTenant()
    } catch (err: any) {
      setConfig(anterior)
      setErro(err?.message ?? 'Não foi possível salvar a configuração do carimbo.')
    } finally {
      setSalvando(false)
    }
  }

  function alternar(campo: CampoCarimbo) {
    salvar({ ...config, [campo]: !config[campo] })
  }

  const personalizado = Object.keys(diferencasDoPadrao(config)).length > 0

  return (
    <SecaoRecolhivel id="carimbo" icone={<Stamp size={16} className="text-primary" />}
      titulo="Carimbo das fotos de evidência"
      descricao="Escolha o que aparece em cada foto tirada em campo. Vale para as próximas fotos — as já enviadas não mudam."
      resumo={personalizado ? 'Personalizado' : 'Padrão'}>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          {CAMPOS_CARIMBO.map(c => (
            <div key={c.campo} className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{c.rotulo}</p>
                {c.descricao && <p className="text-[11px] text-muted-foreground">{c.descricao}</p>}
              </div>
              <button
                type="button"
                role="switch"
                aria-label={c.rotulo}
                aria-checked={config[c.campo]}
                disabled={salvando}
                onClick={() => alternar(c.campo)}
                className={'flex-shrink-0 w-11 h-6 rounded-full transition relative disabled:opacity-50 ' + (config[c.campo] ? 'bg-primary' : 'bg-secondary')}
              >
                <span className={'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ' + (config[c.campo] ? 'left-5' : 'left-0.5')} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 py-1.5 opacity-70">
            <div>
              <p className="text-sm text-foreground">Selo ATOS</p>
              <p className="text-[11px] text-muted-foreground">Sempre presente no canto superior</p>
            </div>
            <span className="text-[11px] text-muted-foreground">fixo</span>
          </div>
          {personalizado && (
            <button type="button" onClick={() => salvar(resolverConfigCarimbo({}))} disabled={salvando}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50">
              <RotateCcw size={12} /> Restaurar padrão
            </button>
          )}
        </div>

        <div className="sm:w-56">
          <div className="flex gap-1 mb-2 text-xs">
            {(['retrato', 'paisagem'] as const).map(o => (
              <button key={o} type="button" onClick={() => setOrientacao(o)}
                className={'px-2.5 py-1 rounded-md transition ' + (orientacao === o ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}>
                {o === 'retrato' ? 'Retrato' : 'Paisagem'}
              </button>
            ))}
          </div>
          <canvas ref={setCanvas} aria-label="Prévia do carimbo" className="w-full rounded-md border border-border" />
          <p className="text-[11px] text-muted-foreground mt-1">Prévia com dados de exemplo</p>
        </div>
      </div>

      {erro && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mt-3">{erro}</div>}
    </SecaoRecolhivel>
  )
}
