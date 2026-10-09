import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, UserPlus, Mail, RotateCw, X, Users2, Pencil, Power, Download, Trash2, Check, ShieldCheck, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { carregarGestao, chamarAcesso, baixarJson, type GestaoCliente, type PessoaPortal, type EquipePortal } from '@/lib/portalAcesso'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Pessoas, convites, equipes e pedidos de acesso de UM cliente do portal.
// Usada nos dois lados: pela equipe interna (aba "Portal" do cliente, papel
// "interno") e pelo Supervisor, dentro do próprio portal (papel "supervisor").
// As regras de quem pode o quê ficam no banco e na função portal-acesso.

const PERFIL: Record<string, string> = { supervisor: 'Supervisor', usuario: 'Usuário' }
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

export default function GestaoPortalCliente({ clientId, eu, onMudou }: { clientId: string; eu?: string; onMudou?: () => void }) {
  const [g, setG] = useState<GestaoCliente | null>(null)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [convidando, setConvidando] = useState(false)
  const [equipe, setEquipe] = useState<EquipePortal | 'nova' | null>(null)
  const [remover, setRemover] = useState<PessoaPortal | null>(null)

  const carregar = useCallback(async () => {
    const r = await carregarGestao(clientId)
    if (r.erro) setErro(r.erro); else { setErro(''); setG(r.gestao!) }
  }, [clientId])
  useEffect(() => { setG(null); carregar() }, [carregar])

  const interno = g?.papel === 'interno'
  const nomeEquipe = (id: string) => g?.equipes.find(e => e.id === id)?.nome ?? ''
  const nSupervisores = g?.pessoas.filter(p => p.perfil === 'supervisor' && p.ativo).length ?? 0

  async function aviso(r: { ok: boolean; erro?: string }, ok: string) {
    setMsg({ ok: r.ok, texto: r.ok ? ok : r.erro ?? 'Não foi possível concluir.' })
    if (r.ok) { await carregar(); onMudou?.() }
  }
  async function alterar(p: PessoaPortal, perfil: string, ativo: boolean) {
    const { error } = await supabase.rpc('portal_alterar_vinculo', { p_client: clientId, p_user: p.user_id, p_perfil: perfil, p_ativo: ativo })
    await aviso({ ok: !error, erro: error?.message }, ativo ? 'Acesso atualizado.' : 'Acesso desativado. O histórico da pessoa é mantido.')
  }
  async function exportar(p: PessoaPortal) {
    const { data, error } = await supabase.rpc('portal_exportar_pessoa', { p_user: p.user_id })
    if (error) { setMsg({ ok: false, texto: error.message }); return }
    baixarJson(`dados-${p.email.replace(/[^a-z0-9]+/gi, '_')}.json`, data)
    setMsg({ ok: true, texto: 'Arquivo com os dados da pessoa baixado.' })
  }
  async function decidir(id: string, aprovar: boolean, motivo?: string) {
    const r = await chamarAcesso({ acao: 'decidir_solicitacao', id, aprovar, motivo })
    await aviso(r, aprovar ? 'Pedido aprovado: a pessoa recebeu o convite por e-mail.' : 'Pedido recusado.')
  }

  if (erro) return <p className="text-sm text-red-400" role="alert">{erro}</p>
  if (!g) return <Loader2 className="animate-spin text-muted-foreground" size={18} />

  return (
    <div className="space-y-6" data-testid="gestao-portal">
      {msg && <p className={cn('text-xs rounded-md px-3 py-2 border', msg.ok ? 'text-green-300 bg-green-500/10 border-green-500/20' : 'text-red-300 bg-red-500/10 border-red-500/20')} role="status" data-testid="gestao-msg">{msg.texto}</p>}

      {g.solicitacoes.length > 0 && (
        <section data-testid="secao-solicitacoes">
          <h3 className="text-sm font-semibold text-foreground mb-2">Pedidos de acesso <span className="text-xs text-amber-300 font-normal">({g.solicitacoes.length} {g.solicitacoes.length === 1 ? 'pendente' : 'pendentes'})</span></h3>
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-md divide-y divide-border">
            {g.solicitacoes.map(s => (
              <div key={s.id} className="p-3 flex flex-wrap items-start justify-between gap-2" data-solicitacao={s.email}>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{s.nome} <span className="text-xs text-muted-foreground">· {s.email}{s.celular ? ` · ${s.celular}` : ''}</span></p>
                  {s.mensagem && <p className="text-xs text-muted-foreground mt-0.5">"{s.mensagem}"</p>}
                  <p className="text-[11px] text-muted-foreground">Pedido em {dia(s.criado_em)}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="cta" onClick={() => decidir(s.id, true)} data-testid="aprovar"><Check size={13} /> Aprovar</Button>
                  <Button size="sm" variant="outline" onClick={() => { const m = prompt('Motivo da recusa (opcional):'); if (m !== null) decidir(s.id, false, m) }}>Recusar</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-foreground">Pessoas com acesso <span className="text-xs text-muted-foreground font-normal">({g.pessoas.filter(p => p.ativo).length} ativas)</span></h3>
          <Button size="sm" variant="cta" onClick={() => setConvidando(true)} data-testid="convidar"><UserPlus size={14} /> Convidar pessoa</Button>
        </div>
        {g.pessoas.length === 0 ? (
          <p className="text-xs text-muted-foreground border border-border rounded-md p-4 text-center">Ninguém tem acesso ainda. Convide o primeiro Supervisor: ele cria os demais usuários e as equipes.</p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border" data-testid="lista-pessoas">
            {g.pessoas.map(p => (
              <div key={p.user_id} className={cn('p-3 flex flex-wrap items-center justify-between gap-2', !p.ativo && 'opacity-55')} data-pessoa={p.email}>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{p.nome} {p.user_id === eu && <span className="text-[10px] text-muted-foreground">(você)</span>}</p>
                  <p className="text-xs text-muted-foreground">{p.email}{p.celular ? ` · ${p.celular}` : ''}</p>
                  {p.equipes.length > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">Equipes: {p.equipes.map(nomeEquipe).filter(Boolean).join(', ')}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.ativo && p.user_id !== eu ? (
                    <select aria-label={'Perfil de ' + p.nome} value={p.perfil} onChange={e => alterar(p, e.target.value, true)}
                      className="px-2 py-1 rounded-md bg-input border border-border text-xs text-foreground">
                      <option value="usuario">Usuário</option><option value="supervisor">Supervisor</option>
                    </select>
                  ) : <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{PERFIL[p.perfil]}</span>}
                  {!p.ativo && <span className="text-[11px] text-red-400">desativado</span>}
                  {p.user_id !== eu && (
                    <button title={p.ativo ? 'Desativar acesso' : 'Reativar acesso'} onClick={() => alterar(p, p.perfil, !p.ativo)} data-testid={p.ativo ? 'desativar' : 'reativar'}
                      className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"><Power size={14} /></button>
                  )}
                  {interno && (<>
                    <button title="Exportar os dados da pessoa (LGPD)" onClick={() => exportar(p)} data-testid="exportar"
                      className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"><Download size={14} /></button>
                    <button title="Remover e anonimizar os dados (LGPD)" onClick={() => setRemover(p)} data-testid="anonimizar"
                      className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-secondary"><Trash2 size={14} /></button>
                  </>)}
                </div>
              </div>
            ))}
          </div>
        )}
        {nSupervisores === 0 && g.pessoas.length > 0 && <p className="text-[11px] text-amber-300 mt-1">Este cliente não tem nenhum Supervisor ativo.</p>}
      </section>

      {g.convites.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2">Convites aguardando aceite</h3>
          <div className="border border-border rounded-md divide-y divide-border" data-testid="lista-convites">
            {g.convites.map(c => (
              <div key={c.id} className="p-3 flex flex-wrap items-center justify-between gap-2" data-convite={c.email}>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{c.nome} <span className="text-xs text-muted-foreground">· {c.email} · {PERFIL[c.perfil]}</span></p>
                  <p className={cn('text-[11px] inline-flex items-center gap-1', c.expirado ? 'text-red-400' : 'text-muted-foreground')}><Clock size={11} /> {c.expirado ? `Expirou em ${dia(c.expira_em)}` : `Vale até ${dia(c.expira_em)}`}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={async () => aviso(await chamarAcesso({ acao: 'reenviar', convite_id: c.id }), 'Novo convite enviado. O link anterior deixou de valer.')} data-testid="reenviar"><RotateCw size={13} /> Reenviar</Button>
                  <Button size="sm" variant="ghost" onClick={async () => aviso(await chamarAcesso({ acao: 'revogar_convite', convite_id: c.id }), 'Convite cancelado.')} data-testid="revogar"><X size={13} /> Cancelar</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-foreground">Equipes <span className="text-xs text-muted-foreground font-normal">(quem enxerga os chamados de quem)</span></h3>
          <Button size="sm" variant="outline" onClick={() => setEquipe('nova')} data-testid="nova-equipe"><Users2 size={14} /> Nova equipe</Button>
        </div>
        {g.equipes.length === 0 ? (
          <p className="text-xs text-muted-foreground border border-border rounded-md p-4 text-center">Nenhuma equipe. Crie equipes (ex.: "Loja Centro", "Financeiro") para que as pessoas vejam os chamados umas das outras.</p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border" data-testid="lista-equipes">
            {g.equipes.map(e => (
              <div key={e.id} className={cn('p-3 flex items-center justify-between gap-2', !e.ativo && 'opacity-55')} data-equipe={e.nome}>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{e.nome}{!e.ativo && <span className="text-[10px] text-muted-foreground ml-2">inativa</span>}</p>
                  <p className="text-[11px] text-muted-foreground">{e.membros.length} {e.membros.length === 1 ? 'pessoa' : 'pessoas'}{e.unidades.length ? ` · ${e.unidades.length} ${e.unidades.length === 1 ? 'unidade' : 'unidades'}` : ' · todas as unidades'}</p>
                </div>
                <button title="Editar equipe" onClick={() => setEquipe(e)} className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"><Pencil size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {convidando && <ConvidarModal clientId={clientId} g={g} onFechar={() => setConvidando(false)} onFeito={(t) => { setConvidando(false); setMsg({ ok: true, texto: t }); carregar(); onMudou?.() }} />}
      {equipe && <EquipeModal clientId={clientId} g={g} equipe={equipe === 'nova' ? null : equipe} onFechar={() => setEquipe(null)} onSalvo={() => { setEquipe(null); setMsg({ ok: true, texto: 'Equipe salva.' }); carregar() }} />}
      {remover && <RemoverModal pessoa={remover} onFechar={() => setRemover(null)} onFeito={t => { setRemover(null); setMsg({ ok: true, texto: t }); carregar(); onMudou?.() }} />}
    </div>
  )
}

function ConvidarModal({ clientId, g, onFechar, onFeito }: { clientId: string; g: GestaoCliente; onFechar: () => void; onFeito: (t: string) => void }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [perfil, setPerfil] = useState<'usuario' | 'supervisor'>(g.pessoas.length === 0 ? 'supervisor' : 'usuario')
  const [equipes, setEquipes] = useState<string[]>([])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    setErro('')
    if (nome.trim().length < 2) { setErro('Informe o nome.'); return }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErro('Informe um e-mail válido.'); return }
    setEnviando(true)
    const r = await chamarAcesso({ acao: 'convidar', client_id: clientId, nome: nome.trim(), email: email.trim(), perfil, equipes })
    setEnviando(false)
    if (!r.ok) { setErro(r.erro ?? 'Não foi possível convidar.'); return }
    const d = r.dados
    onFeito(d.ja_tem_conta
      ? `${nome.trim()} já tem conta: recebeu o acesso por e-mail e usa a mesma senha de sempre.`
      : d.email_enviado ? `Convite enviado para ${email.trim()}. A pessoa cria a própria senha pelo link (vale 7 dias).`
      : `Convite criado, mas o e-mail não pôde ser enviado${d.motivo_email === 'dominio_reservado' ? ' (endereço de teste)' : ''}. Use "Reenviar" depois.`)
  }
  return (
    <Modal open onOpenChange={o => { if (!o) onFechar() }} title="Convidar pessoa" fecharAoClicarFora={false}
      description="A pessoa recebe um e-mail e cria a própria senha. Você nunca define a senha de ninguém.">
      <div className="space-y-4" data-testid="form-convite">
        <div><Label htmlFor="cv-nome">Nome *</Label><Input id="cv-nome" value={nome} onChange={e => setNome(e.target.value)} /></div>
        <div><Label htmlFor="cv-email">E-mail *</Label><Input id="cv-email" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div>
          <Label>Perfil</Label>
          <div className="space-y-1.5">
            {([['usuario', 'Usuário', 'Abre chamados e acompanha os dele e os da sua equipe.'], ['supervisor', 'Supervisor', 'Vê todos os chamados do cliente e gerencia pessoas e equipes.']] as const).map(([v, r, d]) => (
              <label key={v} className={cn('flex items-start gap-2 p-2.5 rounded-md border cursor-pointer', perfil === v ? 'border-primary/50 bg-primary/5' : 'border-border')}>
                <input type="radio" name="cv-perfil" checked={perfil === v} onChange={() => setPerfil(v)} className="mt-1" data-testid={'cv-' + v} />
                <span><span className="text-sm font-medium text-foreground">{r}</span><span className="block text-[11px] text-muted-foreground">{d}</span></span>
              </label>
            ))}
          </div>
        </div>
        {g.equipes.filter(e => e.ativo).length > 0 && (
          <div>
            <Label>Equipes (opcional)</Label>
            <div className="flex flex-wrap gap-2">
              {g.equipes.filter(e => e.ativo).map(e => (
                <label key={e.id} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={equipes.includes(e.id)} onChange={ev => setEquipes(ev.target.checked ? [...equipes, e.id] : equipes.filter(x => x !== e.id))} /> {e.nome}
                </label>
              ))}
            </div>
          </div>
        )}
        {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onFechar}>Cancelar</Button><Button variant="cta" loading={enviando} onClick={enviar} data-testid="enviar-convite"><Mail size={14} /> Enviar convite</Button></div>
      </div>
    </Modal>
  )
}

function EquipeModal({ clientId, g, equipe, onFechar, onSalvo }: { clientId: string; g: GestaoCliente; equipe: EquipePortal | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(equipe?.nome ?? '')
  const [membros, setMembros] = useState<string[]>(equipe?.membros ?? [])
  const [unidades, setUnidades] = useState<string[]>(equipe?.unidades ?? [])
  const [ativo, setAtivo] = useState(equipe?.ativo ?? true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const candidatos = useMemo(() => g.pessoas.filter(p => p.ativo), [g.pessoas])
  async function salvar() {
    setErro('')
    if (nome.trim().length < 2) { setErro('Informe o nome da equipe.'); return }
    setSalvando(true)
    const { error } = await supabase.rpc('portal_salvar_equipe', { p_client: clientId, p_id: equipe?.id ?? null, p_nome: nome, p_membros: membros, p_unidades: unidades, p_ativo: ativo })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }
  const alterna = (lista: string[], set: (v: string[]) => void, id: string, on: boolean) => set(on ? [...lista, id] : lista.filter(x => x !== id))
  return (
    <Modal open onOpenChange={o => { if (!o) onFechar() }} title={equipe ? 'Editar equipe' : 'Nova equipe'} fecharAoClicarFora={false}>
      <div className="space-y-4" data-testid="form-equipe">
        <div><Label htmlFor="eq-nome">Nome *</Label><Input id="eq-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Loja Centro, Financeiro" /></div>
        <div>
          <Label>Pessoas</Label>
          {candidatos.length === 0 ? <p className="text-xs text-muted-foreground">Convide pessoas primeiro.</p> : (
            <div className="max-h-44 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {candidatos.map(p => (
                <label key={p.user_id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer" data-membro={p.nome}>
                  <input type="checkbox" checked={membros.includes(p.user_id)} onChange={e => alterna(membros, setMembros, p.user_id, e.target.checked)} />
                  <span className="text-foreground">{p.nome}</span><span className="text-[10px] text-muted-foreground">{PERFIL[p.perfil]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {g.unidades.length > 0 && (
          <div>
            <Label>Unidades (opcional)</Label>
            <div className="max-h-36 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {g.unidades.map(u => (
                <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={unidades.includes(u.id)} onChange={e => alterna(unidades, setUnidades, u.id, e.target.checked)} /> <span className="text-foreground">{u.nome}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Sem unidades marcadas, a equipe vale para todas. Marcadas, ao abrir um chamado só aparecem as unidades dela.</p>
          </div>
        )}
        {equipe && <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Equipe ativa</label>}
        {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onFechar}>Cancelar</Button><Button variant="cta" loading={salvando} onClick={salvar}>Salvar</Button></div>
      </div>
    </Modal>
  )
}

function RemoverModal({ pessoa, onFechar, onFeito }: { pessoa: PessoaPortal; onFechar: () => void; onFeito: (t: string) => void }) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  async function confirmar() {
    setEnviando(true)
    const r = await chamarAcesso({ acao: 'anonimizar', user_id: pessoa.user_id })
    setEnviando(false)
    if (!r.ok) { setErro(r.erro ?? 'Não foi possível concluir.'); return }
    onFeito(r.dados.anonimizada ? 'Dados da pessoa apagados e acesso encerrado.' : 'Pessoa removida deste portal. Ela mantém a conta porque tem acesso a outros portais.')
  }
  return (
    <Modal open onOpenChange={o => { if (!o) onFechar() }} title="Remover pessoa e anonimizar dados" fecharAoClicarFora={false}>
      <div className="space-y-4" data-testid="modal-anonimizar">
        <p className="text-sm text-foreground flex items-start gap-2"><ShieldCheck size={16} className="text-primary mt-0.5 flex-shrink-0" /> <span>Atende a um pedido do titular (LGPD). <b>{pessoa.nome}</b> ({pessoa.email}) perde o acesso e as equipes.</span></p>
        <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
          <li>Se ela só tem acesso à sua empresa, o <b>nome, e-mail e celular são apagados</b> e a conta é bloqueada. Não há como desfazer.</li>
          <li>Se também tem acesso a outros portais, ela só é <b>removida deste</b> e mantém a conta.</li>
          <li>Os chamados e o histórico continuam, sem identificar a pessoa.</li>
          <li>Antes, você pode baixar os dados dela pelo botão de exportar.</li>
        </ul>
        {erro && <p className="text-sm text-red-400" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onFechar}>Cancelar</Button><Button variant="cta" loading={enviando} onClick={confirmar} data-testid="confirmar-anonimizar">Remover e anonimizar</Button></div>
      </div>
    </Modal>
  )
}
