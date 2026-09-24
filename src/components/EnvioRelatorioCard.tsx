import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { SecaoRecolhivel } from '@/components/ui/secao-recolhivel'
import { MultiCombobox } from '@/components/ui/multi-combobox'
import { Button } from '@/components/ui/button'
import { useTechnicians } from '@/hooks/useTechnicians'
import { Send, Lock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useConfigEnvio, NIVEL_ROTULO, montarMensagem, type NivelEnvio } from '@/lib/envio'
import { nomeEmpresa } from '@/lib/empresa'

// Configurações → "Envio do relatório" (admin). Canais, mensagem padrão,
// quem pode enviar (Bloco E) e e-mail próprio (nível Intermediário+).
// O nível vem do plano (até a F8: definido pelo Super Admin em Empresas).

const CHAVES = ['{cliente}', '{os}', '{empresa}', '{link}']

export default function EnvioRelatorioCard() {
  const { tenant, user } = useAuth()
  const { config, recarregar } = useConfigEnvio(tenant?.id)
  const { technicians } = useTechnicians()
  const nivel = ((tenant as any)?.envio_nivel ?? 'basico') as NivelEnvio
  const [f, setF] = useState<any>(null)
  const [senha, setSenha] = useState('')
  const [temSenha, setTemSenha] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [testeDestino, setTesteDestino] = useState('')
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => { if (config) setF({ ...config }) }, [config])
  useEffect(() => { supabase.rpc('tem_senha_smtp').then(({ data }) => setTemSenha(!!data)) }, [])
  useEffect(() => { if (user?.email) setTesteDestino(user.email) }, [user?.email])

  const opcoesTec = useMemo(() => technicians.filter((t: any) => t.active !== false).map((t: any) => ({ value: t.id, label: t.name })), [technicians])
  if (!f) return null
  const set = (k: string, v: any) => { setMsg(null); setF((x: any) => ({ ...x, [k]: v })) }
  const exemplo = montarMensagem(f.mensagem, { os: 'OS-0012', empresa: nomeEmpresa(tenant), cliente: 'Cliente Exemplo', link: `${window.location.origin}/verificar/K7P29XQ4M3TD` })

  async function salvar() {
    setMsg(null); setSalvando(true)
    const { error } = await supabase.rpc('salvar_config_envio', {
      p_whatsapp: f.whatsapp_ativo, p_email: f.email_ativo, p_mensagem: f.mensagem, p_permissao: f.permissao, p_tecnicos: f.tecnicos_permitidos,
      p_smtp_ativo: f.smtp_ativo, p_smtp_host: f.smtp_host, p_smtp_porta: 465, p_smtp_usuario: f.smtp_usuario,
      p_smtp_remetente_nome: f.smtp_remetente_nome, p_smtp_email_remetente: f.smtp_email_remetente,
    })
    if (!error && senha) {
      const { error: e2 } = await supabase.rpc('definir_senha_smtp', { p_senha: senha })
      if (e2) { setSalvando(false); setMsg({ ok: false, texto: e2.message }); return }
      setSenha(''); setTemSenha(true)
    }
    setSalvando(false)
    if (error) { setMsg({ ok: false, texto: error.message }); return }
    setMsg({ ok: true, texto: 'Configurações de envio salvas.' }); recarregar()
  }

  async function testar() {
    setTeste(null); setTestando(true)
    const { data, error } = await supabase.functions.invoke('enviar-relatorio', { body: { teste_smtp: true, destino: testeDestino } })
    setTestando(false)
    const d = data as any
    setTeste(!error && d?.ok ? { ok: true, texto: `E-mail de teste enviado para ${testeDestino}.` } : { ok: false, texto: d?.erro ?? 'Falha no teste. Salve os dados antes de testar.' })
  }

  const cls = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
  const Switch = ({ k, rotulo, desc }: { k: string; rotulo: string; desc: string }) => (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div><p className="text-sm text-foreground">{rotulo}</p><p className="text-[11px] text-muted-foreground">{desc}</p></div>
      <button type="button" role="switch" aria-label={rotulo} aria-checked={!!f[k]} onClick={() => set(k, !f[k])}
        className={'flex-shrink-0 w-11 h-6 rounded-full transition relative ' + (f[k] ? 'bg-primary' : 'bg-secondary')}>
        <span className={'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ' + (f[k] ? 'left-5' : 'left-0.5')} />
      </button>
    </div>
  )

  return (
    <SecaoRecolhivel id="envio-relatorio" icone={<Send size={16} className="text-primary" />}
      titulo="Envio do relatório"
      descricao="Como o relatório da OS concluída chega ao cliente: canais, mensagem, quem pode enviar e e-mail próprio."
      resumo={<>{[f.whatsapp_ativo && 'WhatsApp', f.email_ativo && 'E-mail'].filter(Boolean).join(' + ') || 'Desligado'}</>}>
      <div className="space-y-4" data-testid="envio-config">
        <p className="text-xs text-muted-foreground">Nível do seu plano: <span className="text-foreground">{NIVEL_ROTULO[nivel]}</span></p>

        <div className="divide-y divide-border">
          <Switch k="whatsapp_ativo" rotulo="WhatsApp" desc="Abre o WhatsApp do aparelho com a mensagem pronta e o link do relatório." />
          <Switch k="email_ativo" rotulo="E-mail" desc={f.smtp_ativo ? 'Enviado pelo e-mail próprio da empresa, com o PDF anexado.' : `Enviado como "${nomeEmpresa(tenant)} via ATOS", respondendo para o e-mail de contato da empresa, com o PDF anexado.`} />
        </div>

        <div>
          <label htmlFor="env-cfg-msg" className="block text-xs text-muted-foreground mb-1">Mensagem padrão</label>
          <textarea id="env-cfg-msg" value={f.mensagem} onChange={e => set('mensagem', e.target.value)} rows={4} className={cls + ' resize-none'} />
          <div className="flex flex-wrap gap-1 mt-1">
            {CHAVES.map(c => <button key={c} type="button" onClick={() => set('mensagem', f.mensagem + ' ' + c)} className="px-2 py-0.5 rounded bg-secondary text-[11px] text-foreground hover:bg-secondary/70">{c}</button>)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">Exemplo: <span className="text-foreground/80">{exemplo}</span></p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Quem pode enviar (gestores e administradores sempre podem)</p>
          <div className="flex flex-wrap gap-2">
            {([['todos', 'Todos os técnicos'], ['selecionados', 'Técnicos escolhidos'], ['ninguem', 'Nenhum técnico']] as const).map(([v, r]) => (
              <button key={v} type="button" onClick={() => set('permissao', v)} aria-pressed={f.permissao === v}
                className={'px-3 py-1.5 rounded-md border text-sm ' + (f.permissao === v ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-secondary')}>{r}</button>
            ))}
          </div>
          {f.permissao === 'selecionados' && (
            <div className="mt-2"><MultiCombobox options={opcoesTec} value={f.tecnicos_permitidos} onChange={v => set('tecnicos_permitidos', v)} placeholder="Escolha os técnicos" searchPlaceholder="Buscar técnico..." /></div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium text-foreground flex items-center gap-1.5">E-mail próprio da empresa {nivel === 'basico' && <Lock size={13} className="text-muted-foreground" />}</p>
          {nivel === 'basico' ? (
            <p className="text-xs text-muted-foreground mt-1">Disponível a partir do nível Intermediário: o relatório sai do e-mail da própria empresa (ex.: relatorios@suaempresa.com.br).</p>
          ) : (
            <div className="space-y-3 mt-2">
              <Switch k="smtp_ativo" rotulo="Usar o e-mail próprio" desc="Desligado, o envio usa o padrão via ATOS." />
              {f.smtp_ativo && (
                <>
                  <p className="text-[11px] text-amber-300">O servidor de e-mail precisa aceitar a porta 465 (SSL). Gmail, Zoho, Outlook/Microsoft 365 aceitam — use uma "senha de app".</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><label htmlFor="smtp-host" className="block text-xs text-muted-foreground mb-1">Servidor (SMTP)</label><input id="smtp-host" value={f.smtp_host ?? ''} onChange={e => set('smtp_host', e.target.value)} placeholder="smtp.zoho.com" className={cls} /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">Porta</label><input value="465 (SSL)" disabled className={cls + ' opacity-60'} /></div>
                    <div><label htmlFor="smtp-user" className="block text-xs text-muted-foreground mb-1">Usuário</label><input id="smtp-user" value={f.smtp_usuario ?? ''} onChange={e => set('smtp_usuario', e.target.value)} placeholder="relatorios@suaempresa.com.br" className={cls} /></div>
                    <div><label htmlFor="smtp-senha" className="block text-xs text-muted-foreground mb-1">Senha {temSenha && <span className="text-green-400">(cadastrada — deixe em branco para manter)</span>}</label><input id="smtp-senha" type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} className={cls} /></div>
                    <div><label htmlFor="smtp-nome" className="block text-xs text-muted-foreground mb-1">Nome do remetente</label><input id="smtp-nome" value={f.smtp_remetente_nome ?? ''} onChange={e => set('smtp_remetente_nome', e.target.value)} placeholder={nomeEmpresa(tenant)} className={cls} /></div>
                    <div><label htmlFor="smtp-from" className="block text-xs text-muted-foreground mb-1">E-mail do remetente</label><input id="smtp-from" value={f.smtp_email_remetente ?? ''} onChange={e => set('smtp_email_remetente', e.target.value)} placeholder="igual ao usuário" className={cls} /></div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" variant="cta" loading={salvando} onClick={salvar}>Salvar</Button>
          {msg && <p className={'text-xs ' + (msg.ok ? 'text-green-400' : 'text-red-400')} data-testid="envio-cfg-msg">{msg.texto}</p>}
        </div>

        {nivel !== 'basico' && config?.smtp_ativo && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <input value={testeDestino} onChange={e => setTesteDestino(e.target.value)} placeholder="enviar teste para..." className={cls + ' sm:w-64'} />
            <Button type="button" variant="outline" onClick={testar} disabled={testando}>{testando && <Loader2 size={14} className="animate-spin" />} Testar envio</Button>
            {teste && <p className={'text-xs flex items-center gap-1 ' + (teste.ok ? 'text-green-400' : 'text-red-400')}>{teste.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {teste.texto}</p>}
          </div>
        )}
      </div>
    </SecaoRecolhivel>
  )
}
