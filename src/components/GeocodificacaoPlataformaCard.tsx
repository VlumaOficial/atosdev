import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { SecaoRecolhivel } from '@/components/ui/secao-recolhivel'
import { Combobox } from '@/components/ui/combobox'
import { Button } from '@/components/ui/button'
import { MapPinned, Loader2, CheckCircle2, XCircle } from 'lucide-react'

// Super Admin: provedor de endereços do carimbo (serviço da plataforma)
// + consumo geral e por empresa. Decisões 2026-09-24: troca simplificada,
// sem deploy; mesmo provedor em DEV e PRD; dados de consumo para a
// discussão de planos (VISAO_ATOS.md 7.1).

const PROVEDORES = [
  { value: 'nominatim', label: 'Nominatim (OpenStreetMap público) — bloqueia chamadas de servidor, não usar' },
  { value: 'locationiq', label: 'LocationIQ — gratuito até 5.000/dia com link de crédito' },
  { value: 'opencage', label: 'OpenCage — pago (gratuito só para teste)' },
]
const LIMITE_DIA: Record<string, number | null> = { nominatim: null, locationiq: 5000, opencage: null }

interface Status { provedor: string; chave_mascarada: string | null; cache_horas: number; atualizado_em: string }
interface Uso { tenant_id: string; tenant_nome: string; provedor: string; consultas: number; cache: number; falhas: number }

function isoDia(d: Date) { return d.toISOString().slice(0, 10) }

export default function GeocodificacaoPlataformaCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [provedor, setProvedor] = useState('nominatim')
  const [chave, setChave] = useState('')
  const [cacheHoras, setCacheHoras] = useState(48)
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null)
  const [testando, setTestando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [usoMes, setUsoMes] = useState<Uso[]>([])
  const [usoHoje, setUsoHoje] = useState<Uso[]>([])

  async function carregar() {
    const { data } = await supabase.rpc('status_geocodificacao')
    const s = (data as Status[] | null)?.[0] ?? null
    setStatus(s)
    if (s) { setProvedor(s.provedor); setCacheHoras(s.cache_horas) }
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const [m, h] = await Promise.all([
      supabase.rpc('uso_geocodificacao', { p_de: isoDia(inicioMes), p_ate: isoDia(hoje) }),
      supabase.rpc('uso_geocodificacao', { p_de: isoDia(hoje), p_ate: isoDia(hoje) }),
    ])
    setUsoMes((m.data as Uso[]) ?? [])
    setUsoHoje((h.data as Uso[]) ?? [])
  }
  useEffect(() => { carregar() }, [])

  const porEmpresa = useMemo(() => {
    const mapa = new Map<string, { nome: string; consultas: number; cache: number; falhas: number }>()
    for (const u of usoMes) {
      const g = mapa.get(u.tenant_id) ?? { nome: u.tenant_nome, consultas: 0, cache: 0, falhas: 0 }
      g.consultas += Number(u.consultas); g.cache += Number(u.cache); g.falhas += Number(u.falhas)
      mapa.set(u.tenant_id, g)
    }
    return [...mapa.values()].sort((a, b) => b.consultas - a.consultas)
  }, [usoMes])
  const totalMes = porEmpresa.reduce((s, g) => ({ consultas: s.consultas + g.consultas, cache: s.cache + g.cache, falhas: s.falhas + g.falhas }), { consultas: 0, cache: 0, falhas: 0 })
  const consultasHoje = usoHoje.reduce((s, u) => s + Number(u.consultas), 0)
  const limite = LIMITE_DIA[status?.provedor ?? 'nominatim']

  async function testar() {
    setTeste(null); setTestando(true)
    const { data, error } = await supabase.functions.invoke('geocodificar', { body: { testar: { provedor, chave: chave.trim() || null } } })
    setTestando(false)
    const d = data as any
    if (error || !d) setTeste({ ok: false, texto: 'Falha ao chamar o serviço.' })
    else setTeste(d.ok ? { ok: true, texto: `${d.endereco} (${d.ms} ms)` } : { ok: false, texto: d.erro ?? 'O provedor não retornou endereço.' })
  }

  async function salvar() {
    setMsg(''); setSalvando(true)
    const { error } = await supabase.rpc('definir_config_geocodificacao', { p_provedor: provedor, p_chave: chave.trim() || null, p_cache_horas: cacheHoras })
    setSalvando(false)
    if (error) { setMsg(error.message); return }
    setChave(''); setMsg('Provedor ativado. Vale imediatamente para todas as empresas.')
    carregar()
  }

  const nomeAtual = PROVEDORES.find(p => p.value === status?.provedor)?.label.split(' —')[0]
  const campo = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <SecaoRecolhivel id="geocodificacao" icone={<MapPinned size={16} className="text-primary" />}
      titulo="Plataforma — endereço no carimbo"
      descricao="Provedor que converte a coordenada da foto em endereço, para todas as empresas, e o consumo de cada uma."
      resumo={status ? <><span className="text-foreground font-medium">{nomeAtual}</span><br />{totalMes.consultas} consultas no mês</> : <Loader2 size={14} className="animate-spin" />}>
      <div className="space-y-3">
        <div>
          <label htmlFor="geo-prov" className="block text-xs text-muted-foreground mb-1">Provedor</label>
          <Combobox id="geo-prov" options={PROVEDORES} value={provedor} onChange={v => { setProvedor(v); setTeste(null) }} placeholder="Provedor" />
        </div>
        {provedor !== 'nominatim' && (
          <div>
            <label htmlFor="geo-chave" className="block text-xs text-muted-foreground mb-1">
              Chave da API {status?.provedor === provedor && status.chave_mascarada ? `(atual: ${status.chave_mascarada} — deixe em branco para manter)` : ''}
            </label>
            <input id="geo-chave" type="password" autoComplete="off" value={chave} onChange={e => { setChave(e.target.value); setTeste(null) }} className={campo} placeholder="Cole aqui a chave do provedor" />
          </div>
        )}
        <div className="w-40">
          <label htmlFor="geo-cache" className="block text-xs text-muted-foreground mb-1">Cache (horas)</label>
          <input id="geo-cache" type="number" min={0} max={8760} value={cacheHoras} onChange={e => setCacheHoras(Number(e.target.value))} className={campo} />
        </div>
        <p className="text-[11px] text-muted-foreground">LocationIQ gratuito: cache máximo de 48 h e link "Search by LocationIQ.com" visível (exibido automaticamente no rodapé).</p>
        {status?.provedor === 'nominatim' && (
          <p className="text-[11px] text-amber-400">O Nominatim público recusa chamadas vindas do servidor (HTTP 403) — enquanto ele estiver ativo, as fotos saem só com as coordenadas. Cadastre a chave do LocationIQ.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={testar} disabled={testando}>{testando && <Loader2 size={14} className="animate-spin" />} Testar</Button>
          <Button type="button" variant="cta" onClick={salvar} loading={salvando}>Salvar e ativar</Button>
        </div>
        {teste && (
          <p className={'text-xs flex items-start gap-1.5 ' + (teste.ok ? 'text-green-400' : 'text-red-400')} data-testid="geo-teste">
            {teste.ok ? <CheckCircle2 size={14} className="flex-shrink-0" /> : <XCircle size={14} className="flex-shrink-0" />} {teste.texto}
          </p>
        )}
        {msg && <p className="text-xs text-muted-foreground" data-testid="geo-msg">{msg}</p>}

        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium text-foreground">Consumo</p>
          <p className="text-xs text-muted-foreground mt-0.5" data-testid="geo-hoje">
            Hoje: {consultasHoje} {consultasHoje === 1 ? 'consulta' : 'consultas'} ao provedor{limite ? ` de ${limite.toLocaleString('pt-BR')} (limite diário gratuito)` : ''}.
            {' '}Mês: {totalMes.consultas} consultas · {totalMes.cache} respondidas pelo cache (sem custo) · {totalMes.falhas} falhas.
          </p>
          <div className="mt-2 divide-y divide-border">
            {porEmpresa.length === 0 && <p className="text-xs text-muted-foreground py-1">Nenhuma consulta no mês.</p>}
            {porEmpresa.map(g => (
              <div key={g.nome} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span className="text-foreground truncate">{g.nome}</span>
                <span className="text-muted-foreground flex-shrink-0"><span className="text-foreground">{g.consultas}</span> consultas · {g.cache} cache · {g.falhas} falhas</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SecaoRecolhivel>
  )
}
