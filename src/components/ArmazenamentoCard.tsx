import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { HardDrive, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { usoArmazenamento, formatarBytes, type UsoArmazenamento } from '@/lib/armazenamento'

// Espaço ocupado pelas fotos/assinaturas/logo no bucket, por tenant e por
// usuário que enviou (autor do upload). Admin vê só a própria empresa;
// super admin vê todas, cada uma expansível até os técnicos.

// Limite atual do projeto Supabase (plano free) — é por PROJETO, não por
// tenant; só faz sentido mostrar pro super admin. Revisar ao mudar de plano.
const LIMITE_PROJETO_BYTES = 1024 * 1024 * 1024

const ROTULO_ROLE: Record<string, string> = {
  tecnico: 'Técnico', admin: 'Administrador', gestor: 'Gestor', super_admin: 'Super Admin',
}

interface GrupoTenant {
  id: string
  nome: string
  bytes: number
  fotos: number
  usuarios: UsoArmazenamento[]
}

export default function ArmazenamentoCard() {
  const { user } = useAuth()
  const superAdmin = user?.role === 'super_admin'
  const [linhas, setLinhas] = useState<UsoArmazenamento[] | null>(null)
  const [erro, setErro] = useState('')
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})

  useEffect(() => {
    usoArmazenamento().then(setLinhas).catch(e => setErro(e?.message ?? 'Não foi possível calcular o espaço usado.'))
  }, [])

  const grupos = useMemo<GrupoTenant[]>(() => {
    const mapa = new Map<string, GrupoTenant>()
    for (const l of linhas ?? []) {
      const g = mapa.get(l.tenant_id) ?? { id: l.tenant_id, nome: l.tenant_nome, bytes: 0, fotos: 0, usuarios: [] }
      g.bytes += Number(l.bytes)
      g.fotos += Number(l.fotos)
      if (Number(l.arquivos) > 0) g.usuarios.push(l)
      mapa.set(l.tenant_id, g)
    }
    const lista = [...mapa.values()].sort((a, b) => b.bytes - a.bytes)
    for (const g of lista) g.usuarios.sort((a, b) => Number(b.bytes) - Number(a.bytes))
    return lista
  }, [linhas])

  const totalBytes = grupos.reduce((s, g) => s + g.bytes, 0)
  const totalFotos = grupos.reduce((s, g) => s + g.fotos, 0)

  function tabelaUsuarios(g: GrupoTenant) {
    if (!g.usuarios.length) return <p className="text-xs text-muted-foreground py-1">Nenhum arquivo enviado.</p>
    return (
      <div className="divide-y divide-border">
        {g.usuarios.map(u => (
          <div key={u.usuario_id ?? 'sem-autor'} className="flex items-center justify-between gap-3 py-1.5 text-xs">
            <div className="min-w-0">
              <span className="text-foreground">{u.usuario_nome ?? 'Autor removido'}</span>
              {u.usuario_role && <span className="text-muted-foreground"> · {ROTULO_ROLE[u.usuario_role] ?? u.usuario_role}</span>}
            </div>
            <div className="text-right flex-shrink-0 text-muted-foreground">
              <span className="text-foreground">{formatarBytes(Number(u.bytes))}</span> · {Number(u.fotos)} {Number(u.fotos) === 1 ? 'foto' : 'fotos'}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <HardDrive size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Armazenamento</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Espaço ocupado pelas fotos de evidência, assinaturas e logo{superAdmin ? ', por empresa e por usuário' : ', por usuário que enviou'}.
          </p>
        </div>
      </div>

      {erro && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mt-3">{erro}</div>}
      {!linhas && !erro && <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Calculando...</div>}

      {linhas && (
        <div className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-foreground" data-testid="armazenamento-total">{formatarBytes(totalBytes)}</span>
            <span className="text-xs text-muted-foreground">{totalFotos} {totalFotos === 1 ? 'foto' : 'fotos'}{superAdmin ? ` · ${grupos.length} empresas` : ''}</span>
          </div>

          {superAdmin && (
            <div className="mt-2">
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (totalBytes / LIMITE_PROJETO_BYTES) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {((totalBytes / LIMITE_PROJETO_BYTES) * 100).toFixed(1).replace('.', ',')}% de 1 GB — limite do projeto no plano atual do Supabase (todas as empresas somadas)
              </p>
            </div>
          )}

          <div className="mt-3">
            {superAdmin ? (
              <div className="divide-y divide-border border-t border-border">
                {grupos.map(g => (
                  <div key={g.id}>
                    <button type="button" onClick={() => setAbertos(a => ({ ...a, [g.id]: !a[g.id] }))}
                      className="w-full flex items-center justify-between gap-3 py-2 text-sm text-left">
                      <span className="flex items-center gap-1.5 min-w-0">
                        {abertos[g.id] ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                        <span className="truncate text-foreground">{g.nome}</span>
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        <span className="text-foreground">{formatarBytes(g.bytes)}</span> · {g.fotos} fotos
                      </span>
                    </button>
                    {abertos[g.id] && <div className="pl-5 pb-2">{tabelaUsuarios(g)}</div>}
                  </div>
                ))}
              </div>
            ) : (
              grupos[0] && <div className="border-t border-border pt-1">{tabelaUsuarios(grupos[0])}</div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
