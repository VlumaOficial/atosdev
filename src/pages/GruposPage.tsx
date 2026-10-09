import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Loader2, Users2, Hand, UserCog } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useGrupos, type Grupo } from '@/hooks/useGrupos'
import { useCategorias } from '@/hooks/useCatalogoSla'
import { NIVEIS_GRUPO, ROTULO_NIVEL_GRUPO, type NivelGrupo } from '@/lib/grupos'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { MultiCombobox } from '@/components/ui/multi-combobox'
import { cn } from '@/lib/utils'

// Grupos de atendimento (portal E2): equipes internas que recebem e atendem os
// chamados — N1 (triagem), N2/N3 (especialistas) e Campo. Decisões do usuário
// em 2026-10-08 (VISAO_ATOS.md 9.1, ponto 6B).

interface Pessoa { id: string; name: string; role: string; active: boolean }
const ROTULO_PERFIL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', atendente: 'Atendente', tecnico: 'Técnico' }
const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground'

export default function GruposPage() {
  const { tenant, refreshTenant } = useAuth()
  const { grupos, membros, carregando, recarregar } = useGrupos()
  const { categorias } = useCategorias()
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [editando, setEditando] = useState<Grupo | 'novo' | null>(null)
  const [limite, setLimite] = useState(String(tenant?.transferencias_limite ?? 3))
  const [msgLimite, setMsgLimite] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    supabase.from('users').select('id, name, role, active').in('role', ['admin', 'gestor', 'atendente', 'tecnico']).order('name')
      .then(({ data }) => setPessoas((data ?? []) as Pessoa[]))
  }, [])
  useEffect(() => { setLimite(String(tenant?.transferencias_limite ?? 3)) }, [tenant?.transferencias_limite])

  const nome = (id: string) => pessoas.find(p => p.id === id)?.name ?? '—'
  const categoriasDoGrupo = (id: string) => categorias.filter(c => c.grupo_padrao_id === id)

  async function salvarLimite() {
    setMsgLimite(null)
    const { error } = await supabase.rpc('definir_limite_transferencias', { p_limite: parseInt(limite) || 3 })
    if (error) { setMsgLimite({ ok: false, texto: error.message }); return }
    await refreshTenant()
    setMsgLimite({ ok: true, texto: 'Salvo.' })
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Grupos de atendimento" description="As equipes que recebem e atendem os chamados: N1 (triagem), N2/N3 (especialistas) e Campo."
        actions={<Button variant="cta" onClick={() => setEditando('novo')} data-testid="novo-grupo"><Plus size={15} /> Novo grupo</Button>} />

      {carregando ? <Loader2 className="animate-spin text-muted-foreground" size={18} /> : grupos.length === 0 ? (
        <Card className="p-8 text-center" data-testid="sem-grupos">
          <Users2 size={28} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-foreground font-medium">Nenhum grupo ainda</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">Crie um grupo para o N1 (quem faz a triagem) e outros para os especialistas e o campo. Depois, indique na ficha de cada categoria para qual grupo o chamado vai.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-border" data-testid="lista-grupos">
          {grupos.map(g => {
            const ms = membros.filter(m => m.grupo_id === g.id)
            const coords = ms.filter(m => m.coordenador)
            const cats = categoriasDoGrupo(g.id)
            return (
              <div key={g.id} className={cn('p-4 flex flex-wrap items-start justify-between gap-3', !g.ativo && 'opacity-60')} data-grupo={g.nome}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{g.nome}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{ROTULO_NIVEL_GRUPO[g.nivel]}</span>
                    {g.assumir && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 inline-flex items-center gap-1"><Hand size={10} /> Assumir ligado</span>}
                    {!g.ativo && <span className="text-[10px] text-muted-foreground">inativo</span>}
                  </div>
                  {g.descricao && <p className="text-xs text-muted-foreground mt-0.5">{g.descricao}</p>}
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {ms.length} {ms.length === 1 ? 'membro' : 'membros'}
                    {coords.length > 0 && <> · <UserCog size={11} className="inline -mt-0.5" /> Coordenação: {coords.map(c => nome(c.user_id)).join(', ')}</>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {cats.length === 0 ? 'Nenhuma categoria direcionada a este grupo' : `Categorias: ${cats.slice(0, 4).map(c => c.nome).join(', ')}${cats.length > 4 ? ` e mais ${cats.length - 4}` : ''}`}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditando(g)} aria-label={'Editar ' + g.nome}><Pencil size={13} /> Editar</Button>
              </div>
            )
          })}
        </Card>
      )}

      <Card className="p-4 mt-4">
        <p className="text-sm font-medium text-foreground">Alerta de transferências demais</p>
        <p className="text-xs text-muted-foreground mt-0.5">Quando uma OS é transferida muitas vezes, os coordenadores e administradores são avisados. Costuma indicar que a distribuição ou o catálogo precisam de ajuste.</p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Label htmlFor="limite-transf" className="mb-0">Avisar a partir de</Label>
          <Input id="limite-transf" type="number" min={2} max={20} value={limite} onChange={e => setLimite(e.target.value)} className="w-20" />
          <span className="text-sm text-muted-foreground">transferências</span>
          <Button variant="outline" size="sm" onClick={salvarLimite} disabled={limite === String(tenant?.transferencias_limite ?? 3)}>Salvar</Button>
          {msgLimite && <span className={'text-xs ' + (msgLimite.ok ? 'text-green-400' : 'text-red-400')}>{msgLimite.texto}</span>}
        </div>
      </Card>

      {editando && (
        <FormGrupo grupo={editando === 'novo' ? null : editando} pessoas={pessoas} membros={membros} onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); recarregar() }} />
      )}
    </div>
  )
}

function FormGrupo({ grupo, pessoas, membros, onFechar, onSalvo }: {
  grupo: Grupo | null; pessoas: Pessoa[]; membros: { grupo_id: string; user_id: string; coordenador: boolean }[]; onFechar: () => void; onSalvo: () => void
}) {
  const { categorias } = useCategorias()
  const [nome, setNome] = useState(grupo?.nome ?? '')
  const [descricao, setDescricao] = useState(grupo?.descricao ?? '')
  const [nivel, setNivel] = useState<NivelGrupo>(grupo?.nivel ?? 'n1')
  const [assumir, setAssumir] = useState(grupo?.assumir ?? false)
  const [ativo, setAtivo] = useState(grupo?.ativo ?? true)
  const [sel, setSel] = useState<Record<string, boolean>>(() => Object.fromEntries(membros.filter(m => m.grupo_id === grupo?.id).map(m => [m.user_id, m.coordenador])))
  const [cats, setCats] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (grupo) setCats(categorias.filter(c => c.grupo_padrao_id === grupo.id).map(c => c.id)) }, [categorias, grupo])

  const opcoesCat = useMemo(() => categorias.filter(c => c.ativo).map(c => {
    const pai = categorias.find(x => x.id === c.pai_id)
    return { value: c.id, label: pai ? `${pai.nome} › ${c.nome}` : c.nome }
  }), [categorias])
  const candidatos = pessoas.filter(p => p.active || p.id in sel)
    .filter(p => !busca || p.name.toLowerCase().includes(busca.toLowerCase()))

  function alternar(p: Pessoa) {
    setSel(s => { const n = { ...s }; if (p.id in n) delete n[p.id]; else n[p.id] = false; return n })
  }

  async function salvar() {
    setErro('')
    if (nome.trim().length < 2) { setErro('Informe o nome do grupo.'); return }
    setSalvando(true)
    const { error } = await supabase.rpc('salvar_grupo', {
      p_id: grupo?.id ?? null, p_nome: nome, p_descricao: descricao, p_nivel: nivel, p_assumir: assumir, p_ativo: ativo,
      p_membros: Object.entries(sel).map(([user_id, coordenador]) => ({ user_id, coordenador })), p_categorias: cats,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }

  return (
    <Modal open onOpenChange={o => { if (!o) onFechar() }} title={grupo ? 'Editar grupo' : 'Novo grupo'} fecharAoClicarFora={false} className="max-w-2xl">
      <div className="space-y-4" data-testid="form-grupo">
        <div className="grid sm:grid-cols-[1fr_180px] gap-3">
          <div><Label htmlFor="g-nome">Nome *</Label><Input id="g-nome" value={nome} onChange={e => setNome(e.target.value)} maxLength={80} placeholder="Ex.: Central N1, Redes, Campo Interior" /></div>
          <div><Label htmlFor="g-nivel">Nível</Label>
            <select id="g-nivel" value={nivel} onChange={e => setNivel(e.target.value as NivelGrupo)} className={campo}>
              {NIVEIS_GRUPO.map(n => <option key={n.value} value={n.value}>{n.label} — {n.descricao}</option>)}
            </select></div>
        </div>
        <div><Label htmlFor="g-desc">Descrição (opcional)</Label><Input id="g-desc" value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={300} /></div>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={assumir} onChange={e => setAssumir(e.target.checked)} className="mt-0.5" data-testid="g-assumir" />
          <span>Os membros podem <b>assumir</b> chamados da fila do grupo
            <span className="block text-[11px] text-muted-foreground">Desligado (padrão), cada técnico vê só as OS atribuídas a ele. Ligado, os técnicos deste grupo também veem as OS do grupo que ainda estão sem técnico e podem pegá-las — nunca as de colegas.</span></span>
        </label>
        {grupo && (
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Grupo ativo</label>
        )}

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-sm font-medium text-foreground">Membros <span className="text-xs text-muted-foreground font-normal">({Object.keys(sel).length} selecionados)</span></p>
            <Input aria-label="Buscar pessoa" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…" className="w-40 h-8" />
          </div>
          <div className="max-h-56 overflow-y-auto border border-border rounded-md divide-y divide-border" data-testid="g-membros">
            {candidatos.map(p => {
              const marcado = p.id in sel
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-pessoa={p.name}>
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <input type="checkbox" checked={marcado} onChange={() => alternar(p)} />
                    <span className="truncate text-foreground">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">{ROTULO_PERFIL[p.role]}</span>
                    {!p.active && <span className="text-[10px] text-red-400">inativo</span>}
                  </label>
                  {marcado && p.role !== 'tecnico' && (
                    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-pointer" title="Coordenador: distribui o trabalho do grupo e recebe os alertas">
                      <input type="checkbox" checked={sel[p.id]} onChange={e => setSel(s => ({ ...s, [p.id]: e.target.checked }))} data-testid={'coord-' + p.name} /> Coordenador
                    </label>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">O coordenador deve ser Gestor, Atendente ou Administrador (os alertas chegam pelo sino do painel).</p>
        </div>

        <div>
          <Label htmlFor="g-cats">Categorias atendidas</Label>
          <MultiCombobox id="g-cats" options={opcoesCat} value={cats} onChange={setCats} placeholder="Escolha as categorias" searchPlaceholder="Buscar categoria…" />
          <p className="text-[11px] text-muted-foreground mt-1">Toda OS aberta com estas categorias já nasce na fila deste grupo. Uma categoria tem um só grupo padrão.</p>
        </div>

        {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onFechar}>Cancelar</Button><Button variant="cta" loading={salvando} onClick={salvar}>Salvar</Button></div>
      </div>
    </Modal>
  )
}
