import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Search, Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { mascaraCnpj, cnpjValido } from '@/lib/empresa'
import { consultarCnpjReceita, formatarRazaoSocial, type DadosReceita } from '@/lib/cnpj'

// Super Admin — empresas (tenants). Por enquanto: identidade legal
// (razão social + CNPJ), que só a VLUMA altera (decisão 2026-09-24,
// opção B), com consulta à Receita (BrasilAPI) e histórico. O restante
// da gestão de tenants (planos, status, limites) vem na F8.

interface Tenant { id: string; name: string; trade_name: string | null; cnpj: string | null; status: string; plan: string | null }
interface Hist { id: string; alterado_em: string; cnpj_anterior: string | null; razao_anterior: string | null; cnpj_novo: string | null; razao_nova: string | null; fonte: string }

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<Tenant | null>(null)
  const [cnpj, setCnpj] = useState('')
  const [razao, setRazao] = useState('')
  const [fonte, setFonte] = useState<'receita' | 'manual'>('manual')
  const [receita, setReceita] = useState<DadosReceita | null>(null)
  const [consultando, setConsultando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [historico, setHistorico] = useState<Hist[]>([])

  async function carregar() {
    const { data } = await supabase.from('tenants').select('id, name, trade_name, cnpj, status, plan').order('name')
    setTenants((data as Tenant[]) ?? []); setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function abrir(t: Tenant) {
    setEditando(t); setCnpj(t.cnpj ?? ''); setRazao(t.name); setFonte('manual'); setReceita(null); setErro('')
    const { data } = await supabase.from('tenant_identidade_historico').select('*').eq('tenant_id', t.id).order('alterado_em', { ascending: false })
    setHistorico((data as Hist[]) ?? [])
  }

  async function consultar() {
    setErro(''); setReceita(null)
    if (!cnpjValido(cnpj)) { setErro('CNPJ inválido — confira os números.'); return }
    setConsultando(true)
    const r = await consultarCnpjReceita(cnpj)
    setConsultando(false)
    if ('erro' in r) { setErro(r.erro); return }
    setReceita(r); setRazao(formatarRazaoSocial(r.razaoSocial)); setFonte('receita')
  }

  async function salvar() {
    if (!editando) return
    setErro('')
    if (cnpj.trim() && !cnpjValido(cnpj)) { setErro('CNPJ inválido.'); return }
    setSalvando(true)
    const { error } = await supabase.rpc('atualizar_identidade_tenant', { p_tenant: editando.id, p_cnpj: cnpj, p_razao: razao, p_fonte: fonte })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setEditando(null); carregar()
  }

  const campo = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div>
      <PageHeader title="Empresas" description="Empresas clientes do ATOS (tenants) — identidade legal" />
      <Card className="divide-y divide-border">
        {carregando && <div className="p-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Carregando...</div>}
        {tenants.map(t => (
          <div key={t.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t.trade_name || t.name}</p>
              <p className="text-xs text-muted-foreground">{t.trade_name ? t.name + ' · ' : ''}CNPJ {t.cnpj || '—'} · {t.status}{t.plan ? ' · ' + t.plan : ''}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => abrir(t)}><ShieldCheck size={14} /> Identidade legal</Button>
          </div>
        ))}
      </Card>

      <Modal open={!!editando} onOpenChange={o => { if (!o) setEditando(null) }} title="Identidade legal"
        description={editando ? (editando.trade_name || editando.name) : ''} className="max-w-lg">
        <div className="space-y-4">
          <div>
            <label htmlFor="id-cnpj" className="block text-xs text-muted-foreground mb-1">CNPJ</label>
            <div className="flex gap-2">
              <input id="id-cnpj" value={cnpj} onChange={e => { setCnpj(mascaraCnpj(e.target.value)); setReceita(null) }} inputMode="numeric" placeholder="00.000.000/0000-00" className={campo} />
              <Button type="button" variant="outline" onClick={consultar} disabled={consultando}>
                {consultando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Consultar na Receita
              </Button>
            </div>
          </div>
          {receita && (
            <div className={'rounded-md border px-3 py-2 text-xs ' + (receita.ativa ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300')} data-testid="resultado-receita">
              <p className="flex items-center gap-1.5 font-medium">{receita.ativa ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} Situação na Receita: {receita.situacao}</p>
              <p className="mt-1 text-foreground/80">{receita.razaoSocial}{receita.nomeFantasia ? ` — fantasia: ${receita.nomeFantasia}` : ''}</p>
              <p className="text-foreground/70">{[receita.municipio, receita.uf].filter(Boolean).join(' - ')}{receita.telefone ? ` · ${receita.telefone}` : ''}</p>
            </div>
          )}
          <div>
            <label htmlFor="id-razao" className="block text-xs text-muted-foreground mb-1">Razão social {fonte === 'receita' && <span className="text-green-400">(preenchida pela Receita)</span>}</label>
            <input id="id-razao" value={razao} onChange={e => { setRazao(e.target.value); setFonte('manual') }} className={campo} />
          </div>
          {erro && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2" data-testid="identidade-erro">{erro}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button type="button" variant="cta" loading={salvando} onClick={salvar}>Salvar</Button>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium text-foreground">Histórico</p>
            {historico.length === 0 ? <p className="text-xs text-muted-foreground mt-1">Nenhuma alteração registrada.</p> : historico.map(h => (
              <div key={h.id} className="text-xs text-muted-foreground mt-1.5">
                {new Date(h.alterado_em).toLocaleString('pt-BR')} ({h.fonte === 'receita' ? 'conferido na Receita' : 'manual'}): {h.razao_anterior} / {h.cnpj_anterior || '—'} → <span className="text-foreground">{h.razao_nova} / {h.cnpj_novo || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
