import { useEffect, useState } from 'react'
import { Headset, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { SecaoRecolhivel } from '@/components/ui/secao-recolhivel'
import { TIPOS_TERMO, type TipoTermo } from '@/lib/portal'
import { useTermos, TermoEditorModal, TermoLeituraModal, type TermoLinha } from './TermoEditor'

// Super Admin › Configurações: domínio dos portais e termos padrão VLUMA
export default function PortalPlataformaCard() {
  const [dominio, setDominio] = useState('')
  const [prefixo, setPrefixo] = useState('atendimento')
  const [salvo, setSalvo] = useState<{ dominio_base: string | null; prefixo: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [editor, setEditor] = useState<{ tipo: TipoTermo; base: { titulo: string; texto: string } | null } | null>(null)
  const [lendo, setLendo] = useState<TermoLinha | null>(null)
  const termos = useTermos()

  async function carregar() {
    const { data } = await supabase.rpc('portal_config_plataforma')
    const d = data as { dominio_base: string | null; prefixo: string } | null
    setSalvo(d)
    setDominio(d?.dominio_base ?? '')
    setPrefixo(d?.prefixo ?? 'atendimento')
  }
  useEffect(() => { carregar() }, [])

  async function salvar() {
    setSalvando(true)
    setMsg(null)
    const { error } = await supabase.rpc('definir_portal_plataforma', { p_dominio_base: dominio.trim() || null, p_prefixo: prefixo.trim() })
    setSalvando(false)
    if (error) { setMsg({ ok: false, texto: error.message }); return }
    await carregar()
    setMsg({ ok: true, texto: 'Salvo.' })
  }

  const exemplo = dominio ? `${prefixo || 'atendimento'}.empresa.${dominio}` : 'sem domínio: só o endereço interno /portal/<nome>'
  return (
    <SecaoRecolhivel id="plataforma-portal" icone={<Headset size={16} className="text-primary" />}
      titulo="Plataforma — portal de atendimento"
      descricao="Domínio dos portais das empresas e termos padrão aceitos pelos clientes."
      resumo={salvo?.dominio_base ?? 'Sem domínio'}>
      <div className="space-y-5">
        <div>
          <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
            <div>
              <label htmlFor="plat-dominio" className="block text-xs font-medium mb-1">Domínio base</label>
              <input id="plat-dominio" value={dominio} onChange={e => setDominio(e.target.value.toLowerCase())} placeholder="vluma.com.br"
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm" />
            </div>
            <div>
              <label htmlFor="plat-prefixo" className="block text-xs font-medium mb-1">Prefixo</label>
              <input id="plat-prefixo" value={prefixo} onChange={e => setPrefixo(e.target.value.toLowerCase())}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Endereço das empresas: {exemplo}</p>
          <div className="flex items-center gap-2 mt-2">
            <Button variant="cta" size="sm" loading={salvando} onClick={salvar}
              disabled={(dominio || null) === (salvo?.dominio_base ?? null) && prefixo === (salvo?.prefixo ?? 'atendimento')}>Salvar</Button>
            {msg && <p className={'text-xs ' + (msg.ok ? 'text-green-400' : 'text-red-400')}>{msg.texto}</p>}
          </div>
        </div>

        <ChaveAntiRobo />

        <div>
          <p className="text-xs font-medium mb-2">Termos padrão VLUMA</p>
          <div className="divide-y divide-border border border-border rounded-md">
            {TIPOS_TERMO.map(({ tipo, rotulo }) => {
              const t = termos.ultimo(tipo, false)
              return (
                <div key={tipo} className="p-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-foreground">{rotulo} {t && <span className="text-xs text-muted-foreground">· versão {t.versao} · {new Date(t.publicado_em).toLocaleDateString('pt-BR')}</span>}</p>
                  <div className="flex items-center gap-2">
                    {t && <Button variant="outline" size="sm" onClick={() => setLendo(t)}><FileText size={13} /> Ler</Button>}
                    <Button variant="outline" size="sm" onClick={() => setEditor({ tipo, base: t })}>Publicar nova versão</Button>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Modelo baseado na LGPD. Recomendado: revisão jurídica antes de iniciar as vendas.</p>
        </div>
      </div>
      {editor && <TermoEditorModal aberto onFechar={() => setEditor(null)} tipo={editor.tipo} padrao base={editor.base} onPublicado={termos.recarregar} />}
      <TermoLeituraModal termo={lendo} onFechar={() => setLendo(null)} />
    </SecaoRecolhivel>
  )
}

// Anti-robô (Cloudflare Turnstile) do "Solicitar acesso": a chave PÚBLICA fica aqui;
// a chave SECRETA é um segredo da função portal-acesso (TURNSTILE_SECRET), nunca no navegador.
function ChaveAntiRobo() {
  const [chave, setChave] = useState('')
  const [salva, setSalva] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  useEffect(() => {
    supabase.rpc('portal_config_plataforma').then(({ data }) => { const k = (data as any)?.turnstile_site_key ?? ''; setChave(k); setSalva(k) })
  }, [])
  async function salvar() {
    setMsg(null)
    const { error } = await supabase.rpc('definir_turnstile', { p_site_key: chave.trim() || null })
    if (error) { setMsg({ ok: false, texto: error.message }); return }
    setSalva(chave.trim()); setMsg({ ok: true, texto: 'Salvo.' })
  }
  return (
    <div>
      <label htmlFor="plat-turnstile" className="block text-xs font-medium mb-1">Anti-robô do "Solicitar acesso" — chave do site (Turnstile)</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id="plat-turnstile" value={chave} onChange={e => setChave(e.target.value)} placeholder="0x4AAAAAAA…" className="flex-1 min-w-[240px] px-3 py-2 rounded-md bg-input border border-border text-sm" />
        <Button variant="cta" size="sm" onClick={salvar} disabled={chave.trim() === (salva ?? '')}>Salvar</Button>
        {msg && <span className={'text-xs ' + (msg.ok ? 'text-green-400' : 'text-red-400')}>{msg.texto}</span>}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">{salva ? 'Ativo: o formulário mostra a verificação.' : 'Sem chave: o formulário funciona só com o limite de pedidos por origem.'} A chave secreta é configurada na função do servidor.</p>
    </div>
  )
}
