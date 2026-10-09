import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Inbox, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { chamarAcesso } from '@/lib/portalAcesso'
import { Button } from '@/components/ui/button'

// Pedidos de acesso ao portal ainda pendentes, de toda a empresa (Usuários › Solicitações).
// Os que o sistema ligou a um cliente também aparecem na aba Portal do cliente (e para o
// Supervisor); aqui a empresa resolve principalmente os SEM cliente identificado.
interface Pedido { id: string; nome: string; email: string; celular: string | null; cliente_texto: string | null; mensagem: string | null; client_id: string | null; cliente: string | null; criado_em: string }

const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export default function PedidosAcessoEmpresa({ onMudou }: { onMudou?: (pendentes: number) => void }) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [clientes, setClientes] = useState<{ id: string; name: string; portal_ativo: boolean }[]>([])
  const [escolha, setEscolha] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.rpc('portal_solicitacoes_empresa'),
      supabase.from('clients').select('id, name, portal_ativo').eq('active', true).order('name'),
    ])
    setPedidos((p.data ?? []) as Pedido[])
    setClientes((c.data ?? []) as { id: string; name: string; portal_ativo: boolean }[])
    onMudou?.((p.data ?? []).length)
  }, [onMudou])
  useEffect(() => { carregar() }, [carregar])

  async function decidir(p: Pedido, aprovar: boolean) {
    let motivo: string | undefined
    if (!aprovar) { const m = prompt('Motivo da recusa (opcional):'); if (m === null) return; motivo = m }
    const client_id = p.client_id ?? escolha[p.id]
    if (aprovar && !client_id) { setMsg({ ok: false, texto: 'Escolha o cliente da pessoa para aprovar.' }); return }
    setOcupado(p.id)
    const r = await chamarAcesso({ acao: 'decidir_solicitacao', id: p.id, aprovar, client_id, motivo })
    setOcupado(null)
    setMsg({ ok: r.ok, texto: r.ok ? (aprovar ? 'Aprovado: a pessoa recebeu o convite por e-mail.' : 'Pedido recusado.') : r.erro ?? 'Não foi possível concluir.' })
    if (r.ok) await carregar()
  }

  if (pedidos === null) return <Loader2 className="animate-spin text-muted-foreground" size={16} />
  return (
    <div data-testid="pedidos-acesso">
      <p className="text-xs font-medium mb-1 inline-flex items-center gap-1.5"><Inbox size={13} /> Pedidos de acesso ao portal {pedidos.length > 0 && <span className="text-amber-300">({pedidos.length})</span>}</p>
      <p className="text-[11px] text-muted-foreground mb-2">Pessoas que pediram acesso pela tela "Solicitar acesso" do portal. Aprovar envia o convite por e-mail; a pessoa cria a própria senha.</p>
      {msg && <p className={'text-[11px] mb-1 ' + (msg.ok ? 'text-green-400' : 'text-red-400')} role="status">{msg.texto}</p>}
      {pedidos.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhum pedido pendente.</p> : (
        <div className="border border-border rounded-md divide-y divide-border">
          {pedidos.map(p => {
            // o nome informado existe, mas o portal desse cliente está desligado → explica em vez de "não reconhecido"
            const desligado = !p.client_id && p.cliente_texto ? clientes.find(c => !c.portal_ativo && normal(c.name) === normal(p.cliente_texto!)) : undefined
            return (
            <div key={p.id} className="p-3 space-y-2" data-pedido={p.email}>
              <p className="text-sm text-foreground">{p.nome} <span className="text-xs text-muted-foreground">· {p.email}{p.celular ? ` · ${p.celular}` : ''}</span></p>
              <p className="text-[11px] text-muted-foreground">
                Informou: {p.cliente_texto ? `"${p.cliente_texto}"` : '—'} · {p.cliente ? <span className="text-green-400">cliente reconhecido: {p.cliente}</span> : <span className="text-amber-300">cliente não reconhecido</span>}
                {p.mensagem ? ` · "${p.mensagem}"` : ''}
              </p>
              {desligado && (
                <p className="text-[11px] text-amber-300 inline-flex items-start gap-1" data-testid="aviso-portal-desligado"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>O cliente "{desligado.name}" existe, mas o portal dele está desligado. Ligue na aba Portal do cliente (<Link to="/clientes" className="underline">Clientes</Link>) e depois aprove.</span></p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {!p.client_id && (
                  <select aria-label={'Cliente de ' + p.nome} value={escolha[p.id] ?? ''} onChange={e => setEscolha(x => ({ ...x, [p.id]: e.target.value }))}
                    className="px-2 py-1.5 rounded-md bg-input border border-border text-xs text-foreground">
                    <option value="">Escolha o cliente…</option>
                    {clientes.map(c => <option key={c.id} value={c.id} disabled={!c.portal_ativo}>{c.name}{c.portal_ativo ? '' : ' — portal desligado'}</option>)}
                  </select>
                )}
                <Button size="sm" variant="cta" loading={ocupado === p.id} onClick={() => decidir(p, true)} data-testid="aprovar-pedido"><Check size={13} /> Aprovar</Button>
                <Button size="sm" variant="outline" onClick={() => decidir(p, false)}>Recusar</Button>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
