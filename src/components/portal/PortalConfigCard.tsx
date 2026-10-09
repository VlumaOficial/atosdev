import { useEffect, useMemo, useState } from 'react'
import { Headset, ExternalLink, Check, AlertTriangle, Loader2, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { SecaoRecolhivel } from '@/components/ui/secao-recolhivel'
import { urlLogoEmpresa } from '@/lib/uploadLogo'
import { publicarLogoPortal, temaDaCor, TIPOS_TERMO, type TipoTermo } from '@/lib/portal'
import { useTermos, TermoEditorModal, TermoLeituraModal, type TermoLinha } from './TermoEditor'

// Configurações › Portal de atendimento (E1). Só o admin da empresa; o
// portal precisa ter sido habilitado pela VLUMA (Super Admin › Empresas).

function slugDe(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 30)
}

const campo = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

export default function PortalConfigCard() {
  const { tenant, refreshTenant } = useAuth()
  const empresa = tenant?.trade_name || tenant?.name || ''
  const [slug, setSlug] = useState('')
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState('')
  const [boas, setBoas] = useState('')
  const [contatos, setContatos] = useState({ email: '', telefone: '', whatsapp: '', site: '' })
  const [proprios, setProprios] = useState<string[]>([])
  const [ativo, setAtivo] = useState(false)
  const [disp, setDisp] = useState<{ ok: boolean; erro?: string } | null>(null)
  const [checando, setChecando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [plataforma, setPlataforma] = useState<{ dominio_base: string | null; prefixo: string } | null>(null)
  const [editor, setEditor] = useState<{ tipo: TipoTermo; base: { titulo: string; texto: string } | null } | null>(null)
  const [lendo, setLendo] = useState<TermoLinha | null>(null)
  const termos = useTermos()

  useEffect(() => {
    if (!tenant) return
    setSlug(tenant.portal_slug ?? slugDe(empresa))
    setNome(tenant.portal_nome ?? '')
    setCor(tenant.portal_cor ?? '')
    setBoas(tenant.portal_boas_vindas ?? '')
    const c = tenant.portal_contatos ?? {}
    setContatos({ email: c.email ?? '', telefone: c.telefone ?? '', whatsapp: c.whatsapp ?? '', site: c.site ?? '' })
    setProprios(tenant.portal_termos_proprios ?? [])
    setAtivo(!!tenant.portal_ativo)
  }, [tenant]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.rpc('portal_config_plataforma').then(({ data }) => setPlataforma(data as any))
  }, [])

  // disponibilidade do nome curto enquanto digita
  useEffect(() => {
    if (!tenant?.portal_habilitado) return
    if (!slug) { setDisp(null); return }
    setChecando(true)
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('portal_slug_disponivel', { p_slug: slug })
      setDisp(data as any)
      setChecando(false)
    }, 350)
    return () => clearTimeout(t)
  }, [slug, tenant?.portal_habilitado])

  const linkInterno = slug ? `${window.location.origin}/portal/${slug}` : ''
  const subdominio = plataforma?.dominio_base && slug ? `https://${plataforma.prefixo}.${slug}.${plataforma.dominio_base}` : null
  const mudou = useMemo(() => {
    if (!tenant) return false
    const c = tenant.portal_contatos ?? {}
    return slug !== (tenant.portal_slug ?? '') || nome !== (tenant.portal_nome ?? '') || cor !== (tenant.portal_cor ?? '')
      || boas !== (tenant.portal_boas_vindas ?? '') || ativo !== !!tenant.portal_ativo
      || contatos.email !== (c.email ?? '') || contatos.telefone !== (c.telefone ?? '') || contatos.whatsapp !== (c.whatsapp ?? '') || contatos.site !== (c.site ?? '')
      || proprios.slice().sort().join() !== (tenant.portal_termos_proprios ?? []).slice().sort().join()
  }, [tenant, slug, nome, cor, boas, ativo, contatos, proprios])

  if (!tenant) return null

  const resumo = !tenant.portal_habilitado ? 'Não habilitado'
    : tenant.portal_ativo ? <span className="text-green-400">Ativo · {tenant.portal_slug}</span> : 'Não ativado'

  async function salvar() {
    setSalvando(true)
    setMsg(null)
    const { error } = await supabase.rpc('salvar_portal_config', {
      p: { slug, nome, cor: cor || null, boas_vindas: boas, contatos, termos_proprios: proprios, ativo },
    })
    if (error) { setSalvando(false); setMsg({ ok: false, texto: error.message }); return }
    // primeira vez: publica a logo da empresa no portal
    if (!tenant!.portal_logo_versao) await atualizarLogo(false)
    await refreshTenant()
    setSalvando(false)
    setMsg({ ok: true, texto: ativo ? 'Portal salvo e ativo para os clientes.' : 'Configuração salva. O portal ainda não está ativo para os clientes.' })
  }

  async function atualizarLogo(avisar = true) {
    const url = await urlLogoEmpresa()
    if (!url) { if (avisar) setMsg({ ok: false, texto: 'Envie a logo na seção "Marca e dados da empresa" primeiro.' }); return }
    const blob = await (await fetch(url)).blob()
    const erro = await publicarLogoPortal(tenant!.id, blob)
    if (avisar) {
      if (erro) setMsg({ ok: false, texto: erro })
      else { await refreshTenant(); setMsg({ ok: true, texto: 'Logo do portal atualizada.' }) }
    }
  }

  function alternarProprio(tipo: TipoTermo, usar: boolean) {
    setProprios(p => usar ? [...new Set([...p, tipo])] : p.filter(x => x !== tipo))
  }

  return (
    <SecaoRecolhivel id="portal" icone={<Headset size={16} className="text-primary" />}
      titulo="Portal de atendimento"
      descricao="O endereço onde os seus clientes abrem e acompanham chamados, com a marca da sua empresa."
      resumo={resumo}>
      {!tenant.portal_habilitado ? (
        <p className="text-sm text-muted-foreground" data-testid="portal-nao-habilitado">
          O portal de atendimento ainda não está habilitado para a sua empresa. Fale com a VLUMA para habilitar.
        </p>
      ) : (
        <div className="space-y-5" data-testid="portal-config">
          {/* endereço */}
          <div>
            <label htmlFor="portal-slug" className="block text-xs font-medium mb-1">Nome curto (aparece no endereço)</label>
            <input id="portal-slug" value={slug} maxLength={30} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className={campo} />
            <div className="min-h-[18px] mt-1 text-[11px]">
              {checando ? <span className="text-muted-foreground inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Conferindo…</span>
                : disp?.ok ? <span className="text-green-400 inline-flex items-center gap-1"><Check size={11} /> Disponível</span>
                : disp?.erro ? <span className="text-red-400">{disp.erro}</span> : null}
            </div>
            {tenant.portal_slug && slug !== tenant.portal_slug && (
              <p className="text-[11px] text-amber-300 inline-flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 flex-shrink-0" /> O endereço antigo continua levando ao novo por 90 dias. Avise seus clientes.</p>
            )}
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <p>Endereço do portal: {subdominio
                ? <span className="text-foreground">{subdominio}</span>
                : <span>atendimento.{slug || 'nome'}.vluma.com.br <span className="italic">(criado automaticamente — em configuração pela VLUMA)</span></span>}</p>
              {linkInterno && <p>Endereço interno (teste): <a href={linkInterno} target="_blank" rel="noreferrer" className="text-primary hover:underline">{linkInterno}</a></p>}
            </div>
          </div>

          {/* identidade */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="portal-nome" className="block text-xs font-medium mb-1">Nome do portal</label>
              <input id="portal-nome" value={nome} maxLength={80} onChange={e => setNome(e.target.value)} placeholder={`Central de Atendimento ${empresa}`} className={campo} />
            </div>
            <div>
              <label htmlFor="portal-cor" className="block text-xs font-medium mb-1">Cor principal</label>
              <div className="flex items-center gap-2">
                <input type="color" aria-label="Escolher cor" value={cor || '#7c3aed'} onChange={e => setCor(e.target.value)} className="w-10 h-9 rounded border border-border bg-transparent cursor-pointer" />
                <input id="portal-cor" value={cor} onChange={e => setCor(e.target.value)} placeholder="#7c3aed (padrão ATOS)" maxLength={7} className={campo} />
              </div>
            </div>
            <div className="flex items-end">
              <div style={temaDaCor(cor)} className="w-full">
                <span className="block w-full text-center py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Prévia do botão</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="portal-boas" className="block text-xs font-medium mb-1">Mensagem de boas-vindas <span className="text-muted-foreground font-normal">({boas.length}/500)</span></label>
              <textarea id="portal-boas" value={boas} maxLength={500} rows={2} onChange={e => setBoas(e.target.value)}
                placeholder={`Acompanhe seus chamados com a ${empresa}.`} className={campo} />
            </div>
          </div>

          {/* logo */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>O portal usa a logo e o <b>nome de exibição</b> da seção "Marca e dados da empresa"{!tenant.trade_name ? <> — hoje sem nome de exibição, então aparece a razão social ({tenant.name})</> : null}.</span>
            <Button variant="outline" size="sm" onClick={() => atualizarLogo(true)}>Atualizar logo do portal</Button>
          </div>

          {/* contatos */}
          <div>
            <p className="text-xs font-medium mb-1">Contatos exibidos aos clientes</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input aria-label="E-mail de atendimento" value={contatos.email} onChange={e => setContatos(c => ({ ...c, email: e.target.value }))} placeholder="E-mail de atendimento" className={campo} />
              <input aria-label="Telefone" value={contatos.telefone} onChange={e => setContatos(c => ({ ...c, telefone: e.target.value }))} placeholder="Telefone" className={campo} />
              <input aria-label="WhatsApp" value={contatos.whatsapp} onChange={e => setContatos(c => ({ ...c, whatsapp: e.target.value }))} placeholder="WhatsApp com DDD" inputMode="tel" className={campo} />
              <input aria-label="Site" value={contatos.site} onChange={e => setContatos(c => ({ ...c, site: e.target.value }))} placeholder="Site" className={campo} />
            </div>
          </div>

          {/* termos */}
          <div>
            <p className="text-xs font-medium mb-1">Termos aceitos pelos clientes (LGPD)</p>
            <p className="text-[11px] text-muted-foreground mb-2">Use o padrão da VLUMA ou publique o texto da sua empresa. Toda nova versão pede novo aceite.</p>
            <div className="divide-y divide-border border border-border rounded-md">
              {TIPOS_TERMO.map(({ tipo, rotulo }) => {
                const padrao = termos.ultimo(tipo, false)
                const proprio = termos.ultimo(tipo, true)
                const usa = proprios.includes(tipo)
                return (
                  <div key={tipo} className="p-3 flex flex-wrap items-center justify-between gap-2" data-termo={tipo}>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{rotulo}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name={'termo-' + tipo} checked={!usa} onChange={() => alternarProprio(tipo, false)} />
                          Padrão VLUMA {padrao && <span className="text-muted-foreground">v{padrao.versao}</span>}
                          {padrao && <button type="button" onClick={() => setLendo(padrao)} className="text-primary hover:underline" aria-label={'Ler padrão ' + rotulo}><FileText size={12} /></button>}
                        </label>
                        <label className={'inline-flex items-center gap-1.5 ' + (proprio ? 'cursor-pointer' : 'opacity-50')}>
                          <input type="radio" name={'termo-' + tipo} checked={usa} disabled={!proprio} onChange={() => alternarProprio(tipo, true)} />
                          Texto próprio {proprio ? <span className="text-muted-foreground">v{proprio.versao}</span> : <span className="text-muted-foreground">(não publicado)</span>}
                          {proprio && <button type="button" onClick={() => setLendo(proprio)} className="text-primary hover:underline" aria-label={'Ler texto próprio ' + rotulo}><FileText size={12} /></button>}
                        </label>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditor({ tipo, base: proprio ?? padrao })}>
                      {proprio ? 'Nova versão do texto próprio' : 'Escrever texto próprio'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ativação */}
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="mt-0.5" data-testid="portal-ativo" />
            <span>Portal ativo para os clientes <span className="block text-[11px] text-muted-foreground">Desligado, só a equipe da empresa consegue abrir o portal (prévia).</span></span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="cta" size="sm" loading={salvando} disabled={!mudou || (!!slug && disp?.ok === false) || checando} onClick={salvar}>Salvar</Button>
            {tenant.portal_slug && (
              <a href={`/portal/${tenant.portal_slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <ExternalLink size={14} /> Abrir o portal
              </a>
            )}
            {msg && <p className={'text-xs ' + (msg.ok ? 'text-green-400' : 'text-red-400')} role="status">{msg.texto}</p>}
          </div>
        </div>
      )}
      {editor && (
        <TermoEditorModal aberto={!!editor} onFechar={() => setEditor(null)} tipo={editor.tipo} padrao={false} base={editor.base}
          onPublicado={() => { termos.recarregar(); setMsg({ ok: true, texto: 'Texto próprio publicado. Marque "Texto próprio" e salve para usá-lo.' }) }} />
      )}
      <TermoLeituraModal termo={lendo} onFechar={() => setLendo(null)} />
    </SecaoRecolhivel>
  )
}
