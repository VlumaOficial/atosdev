import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Power, Loader2, Eye, EyeOff, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

// Usuários da equipe interna da empresa (administrador). Cria Atendente e
// Gestor; técnicos continuam na tela Técnicos. Decisão do portal E2: o
// Atendente é o perfil do N1 (vê todas as OS, classifica, atribui e
// transfere; não mexe em cadastros nem configurações).

interface Usuario { id: string; name: string; email: string; phone: string | null; role: string; active: boolean }
const PERFIS: Record<string, { rotulo: string; descricao: string }> = {
  admin: { rotulo: 'Administrador', descricao: 'Tudo na empresa, inclusive configurações e usuários' },
  gestor: { rotulo: 'Gestor', descricao: 'Cadastros, catálogo, SLA, grupos e painel gerencial' },
  atendente: { rotulo: 'Atendente', descricao: 'Triagem: vê todas as OS, classifica, atribui, transfere e conversa; sem cadastros nem configurações' },
  tecnico: { rotulo: 'Técnico', descricao: 'Atende em campo as OS atribuídas a ele' },
}
const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground'

export default function UsuariosPage() {
  const { user } = useAuth()
  const [lista, setLista] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<string>('todos')
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('users').select('id, name, email, phone, role, active').in('role', ['admin', 'gestor', 'atendente', 'tecnico']).order('name')
    setLista((data ?? []) as Usuario[])
    setCarregando(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function alternarAtivo(u: Usuario) {
    if (u.id === user?.id) return
    await supabase.from('users').update({ active: !u.active }).eq('id', u.id)
    carregar()
  }
  const visiveis = lista.filter(u => filtro === 'todos' || u.role === filtro)
  const cont = (r: string) => lista.filter(u => u.role === r).length

  return (
    <div className="max-w-4xl">
      <PageHeader title="Usuários" description="A equipe interna da sua empresa: administradores, gestores, atendentes e técnicos."
        actions={<Button variant="cta" onClick={() => setNovo(true)} data-testid="novo-usuario"><Plus size={15} /> Novo usuário</Button>} />

      <div className="flex flex-wrap gap-2 mb-3" role="tablist">
        {[['todos', `Todos (${lista.length})`], ...Object.entries(PERFIS).map(([k, v]) => [k, `${v.rotulo}s (${cont(k)})`])].map(([k, r]) => (
          <button key={k} role="tab" aria-selected={filtro === k} onClick={() => setFiltro(k)}
            className={cn('px-3 py-1 rounded-full text-xs border transition', filtro === k ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary')}>{r}</button>
        ))}
      </div>

      {carregando ? <Loader2 className="animate-spin text-muted-foreground" size={18} /> : (
        <Card className="divide-y divide-border" data-testid="lista-usuarios">
          {visiveis.map(u => (
            <div key={u.id} className={cn('p-3 flex flex-wrap items-center justify-between gap-3', !u.active && 'opacity-55')} data-usuario={u.email}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{u.name} {u.id === user?.id && <span className="text-[10px] text-muted-foreground">(você)</span>}</p>
                <p className="text-xs text-muted-foreground">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{PERFIS[u.role]?.rotulo ?? u.role}</span>
                {!u.active && <span className="text-[11px] text-red-400">inativo</span>}
                {u.role !== 'admin' && u.role !== 'tecnico' && (<>
                  <button title="Editar" onClick={() => setEditando(u)} className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"><Pencil size={14} /></button>
                  <button title={u.active ? 'Desativar' : 'Ativar'} onClick={() => alternarAtivo(u)} className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"><Power size={14} /></button>
                </>)}
                {u.role === 'tecnico' && <span className="text-[10px] text-muted-foreground">gerenciado em Técnicos</span>}
              </div>
            </div>
          ))}
          {visiveis.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhum usuário neste perfil.</p>}
        </Card>
      )}

      {novo && <NovoUsuario onFechar={() => setNovo(false)} onCriado={() => { setNovo(false); carregar() }} />}
      {editando && <EditarUsuario u={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar() }} />}
    </div>
  )
}

function NovoUsuario({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const [role, setRole] = useState<'atendente' | 'gestor'>('atendente')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    setErro('')
    if (name.trim().length < 2) { setErro('Informe o nome.'); return }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErro('Informe um e-mail válido.'); return }
    if (password.length < 8) { setErro('A senha temporária deve ter pelo menos 8 caracteres.'); return }
    setSalvando(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('criar-tecnico', {
      body: { name: name.trim(), email: email.trim().toLowerCase(), password, phone: phone.trim() || null, role },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    })
    setSalvando(false)
    if (error) {
      let m = 'Não foi possível criar o usuário.'
      try { const b = await (error as any).context?.json?.(); if (b?.error) m = b.error } catch { /* mantém */ }
      setErro(m); return
    }
    if (data?.error) { setErro(data.error); return }
    onCriado()
  }

  return (
    <Modal open onOpenChange={o => { if (!o) onFechar() }} title="Novo usuário" fecharAoClicarFora={false}>
      <div className="space-y-4" data-testid="form-usuario">
        <div>
          <Label>Perfil</Label>
          <div className="space-y-1.5">
            {(['atendente', 'gestor'] as const).map(r => (
              <label key={r} className={cn('flex items-start gap-2 p-2.5 rounded-md border cursor-pointer', role === r ? 'border-primary/50 bg-primary/5' : 'border-border')}>
                <input type="radio" name="perfil" checked={role === r} onChange={() => setRole(r)} className="mt-1" data-testid={'perfil-' + r} />
                <span><span className="text-sm font-medium text-foreground">{PERFIS[r].rotulo}</span><span className="block text-[11px] text-muted-foreground">{PERFIS[r].descricao}</span></span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5 inline-flex items-start gap-1"><Info size={11} className="mt-0.5" /> Para cadastrar um técnico, use a tela Técnicos.</p>
        </div>
        <div><Label htmlFor="u-nome">Nome *</Label><Input id="u-nome" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label htmlFor="u-email">E-mail *</Label><Input id="u-email" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="u-tel">Telefone</Label><Input id="u-tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        </div>
        <div>
          <Label htmlFor="u-senha">Senha temporária *</Label>
          <div className="relative">
            <input id="u-senha" type={ver ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className={campo + ' pr-10'} autoComplete="new-password" />
            <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar' : 'Mostrar'} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground">{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Passe esta senha à pessoa; ela pode trocá-la em "Esqueci a senha".</p>
        </div>
        {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onFechar}>Cancelar</Button><Button variant="cta" loading={salvando} onClick={criar}>Criar usuário</Button></div>
      </div>
    </Modal>
  )
}

function EditarUsuario({ u, onFechar, onSalvo }: { u: Usuario; onFechar: () => void; onSalvo: () => void }) {
  const [name, setName] = useState(u.name)
  const [phone, setPhone] = useState(u.phone ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    if (name.trim().length < 2) { setErro('Informe o nome.'); return }
    setSalvando(true)
    const { error } = await supabase.from('users').update({ name: name.trim(), phone: phone.trim() || null }).eq('id', u.id)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }
  return (
    <Modal open onOpenChange={o => { if (!o) onFechar() }} title={`Editar ${PERFIS[u.role]?.rotulo.toLowerCase()}`}>
      <div className="space-y-4">
        <div><Label htmlFor="e-nome">Nome</Label><Input id="e-nome" value={name} onChange={e => setName(e.target.value)} /></div>
        <div><Label htmlFor="e-tel">Telefone</Label><Input id="e-tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">E-mail: {u.email}</p>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onFechar}>Cancelar</Button><Button variant="cta" loading={salvando} onClick={salvar}>Salvar</Button></div>
      </div>
    </Modal>
  )
}
