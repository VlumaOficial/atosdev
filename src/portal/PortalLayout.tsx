import { Link } from 'react-router-dom'
import { Headset, Mail, Phone, Globe, MessageCircle } from 'lucide-react'
import { usePortal } from './PortalContext'
import { linkWhatsApp } from '@/lib/portal'

// Moldura do portal: marca da empresa no topo, ATOS discreto no rodapé
// (ponto 1 do portal, 2026-10-08)
export function MarcaPortal({ grande = false }: { grande?: boolean }) {
  const { id, logo } = usePortal()
  return (
    <div className="flex items-center gap-3 min-w-0">
      {logo
        ? <img src={logo} alt={id.empresa} className={grande ? 'h-12 max-w-[160px] object-contain' : 'h-8 max-w-[120px] object-contain'} />
        : <div className={(grande ? 'w-12 h-12' : 'w-8 h-8') + ' rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0'}>
            <Headset size={grande ? 22 : 16} className="text-primary" />
          </div>}
      {/* no topo estreito do celular, a logo já identifica a empresa: o nome some para não cortar */}
      <div className={'min-w-0' + (!grande && logo ? ' hidden sm:block' : '')}>
        <p className={(grande ? 'text-lg' : 'text-sm') + ' font-semibold text-foreground leading-tight truncate'}>{id.nome}</p>
        {grande && <p className="text-xs text-muted-foreground truncate">{id.empresa}</p>}
      </div>
    </div>
  )
}

export function ContatosEmpresa() {
  const { id } = usePortal()
  const c = id.contatos ?? {}
  const wa = linkWhatsApp(c.whatsapp, `Olá, ${id.empresa}! Preciso de atendimento.`)
  if (!c.email && !c.telefone && !wa && !c.site) return null
  return (
    <div className="flex flex-wrap gap-2" data-testid="portal-contatos">
      {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-green-600 hover:bg-green-500 text-white text-sm font-medium"><MessageCircle size={15} /> Falar pelo WhatsApp</a>}
      {c.telefone && <a href={`tel:${c.telefone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-secondary"><Phone size={15} /> {c.telefone}</a>}
      {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-secondary"><Mail size={15} /> {c.email}</a>}
      {c.site && <a href={/^https?:\/\//.test(c.site) ? c.site : `https://${c.site}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-secondary"><Globe size={15} /> Site</a>}
    </div>
  )
}

export function RodapePortal() {
  const { base } = usePortal()
  return (
    <footer className="mt-10 pb-6 text-center text-[11px] text-muted-foreground space-y-1">
      <p>
        <Link to={`${base}/termos/uso`} className="hover:underline">Termos de uso</Link>
        <span className="mx-2">·</span>
        <Link to={`${base}/termos/privacidade`} className="hover:underline">Privacidade</Link>
      </p>
      <p>Tecnologia <span className="font-medium">ATOS</span> · VLUMA</p>
    </footer>
  )
}

export function AvisoPrevia() {
  const { id } = usePortal()
  if (!id.previa) return null
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-xs text-center px-4 py-2" data-testid="portal-previa">
      Prévia — o portal ainda não está ativo para os clientes. Só a equipe da empresa consegue abrir.
    </div>
  )
}
