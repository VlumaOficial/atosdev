import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Seção de Configurações que abre FECHADA (pedido do usuário, 2026-09-23:
// a página vai crescer — carimbo, armazenamento, exportação, liberar
// espaço). O cabeçalho mostra um resumo para não precisar abrir só pra
// conferir. O estado aberto/fechado é lembrado por navegador (conveniência
// local, não é dado do sistema).

interface Props {
  id: string                 // chave para lembrar aberto/fechado
  icone: React.ReactNode
  titulo: string
  descricao?: string
  resumo?: React.ReactNode   // aparece no cabeçalho, à direita
  children: React.ReactNode
}

function lerAberto(id: string): boolean {
  try { return localStorage.getItem('atos_secao_' + id) === '1' } catch { return false }
}

export function SecaoRecolhivel({ id, icone, titulo, descricao, resumo, children }: Props) {
  const [aberto, setAberto] = useState(() => lerAberto(id))

  function alternar() {
    setAberto(a => {
      try { localStorage.setItem('atos_secao_' + id, a ? '0' : '1') } catch { /* sem storage: só não lembra */ }
      return !a
    })
  }

  return (
    <Card>
      <button type="button" onClick={alternar} aria-expanded={aberto} data-secao={id}
        className="w-full flex items-start gap-3 p-5 text-left">
        <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          {icone}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{titulo}</p>
          {descricao && <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>}
        </div>
        {resumo && <div className="flex-shrink-0 text-xs text-muted-foreground text-right self-center">{resumo}</div>}
        <ChevronDown size={16} className={cn('flex-shrink-0 self-center text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && <div className="px-5 pb-5 -mt-1">{children}</div>}
    </Card>
  )
}
