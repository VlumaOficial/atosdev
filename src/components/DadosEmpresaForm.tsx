import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { cnpjValido, mascaraCnpj } from '@/lib/empresa'

// Dados da empresa que aparecem no cabeçalho do relatório PDF (e o nome
// de exibição também no carimbo das fotos e no menu). Pedido do usuário
// 2026-09-24. Razão social é do Super Admin (dado contratual) — só leitura.
export default function DadosEmpresaForm() {
  const { tenant, refreshTenant } = useAuth()
  const [form, setForm] = useState({ nome: '', cnpj: '', telefone: '', email: '', site: '' })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    if (!tenant) return
    setForm({ nome: tenant.trade_name ?? '', cnpj: tenant.cnpj ?? '', telefone: tenant.phone ?? '', email: tenant.email ?? '', site: tenant.website ?? '' })
  }, [tenant])

  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setMsg(null); setForm(f => ({ ...f, [k]: k === 'cnpj' ? mascaraCnpj(e.target.value) : e.target.value })) },
  })
  const cls = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  async function salvar() {
    setMsg(null)
    if (form.cnpj.trim() && !cnpjValido(form.cnpj)) { setMsg({ ok: false, texto: 'CNPJ inválido — confira os números.' }); return }
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { setMsg({ ok: false, texto: 'E-mail de contato inválido.' }); return }
    setSalvando(true)
    const { error } = await supabase.rpc('atualizar_dados_empresa', {
      p_nome_exibicao: form.nome, p_cnpj: form.cnpj, p_telefone: form.telefone, p_email: form.email, p_site: form.site,
    })
    setSalvando(false)
    if (error) { setMsg({ ok: false, texto: error.message }); return }
    await refreshTenant()
    setMsg({ ok: true, texto: 'Dados salvos. Valem para os próximos relatórios e fotos.' })
  }

  return (
    <div className="mt-5 pt-4 border-t border-border space-y-3" data-testid="dados-empresa">
      <div>
        <p className="text-sm font-medium text-foreground">Dados no relatório</p>
        <p className="text-xs text-muted-foreground mt-0.5">Aparecem no cabeçalho do relatório PDF que o cliente recebe. O nome de exibição também vai no carimbo das fotos e no menu.</p>
      </div>
      <div className="text-xs text-muted-foreground">Razão social: <span className="text-foreground">{tenant?.name}</span> <span className="opacity-70">(alterada pelo suporte VLUMA)</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="emp-nome" className="block text-xs text-muted-foreground mb-1">Nome de exibição</label>
          <input id="emp-nome" {...campo('nome')} placeholder="Ex.: Infoxtec" className={cls} />
        </div>
        <div>
          <label htmlFor="emp-cnpj" className="block text-xs text-muted-foreground mb-1">CNPJ</label>
          <input id="emp-cnpj" {...campo('cnpj')} inputMode="numeric" placeholder="00.000.000/0000-00" className={cls} />
        </div>
        <div>
          <label htmlFor="emp-tel" className="block text-xs text-muted-foreground mb-1">Telefone</label>
          <input id="emp-tel" {...campo('telefone')} inputMode="tel" placeholder="(71) 0000-0000" className={cls} />
        </div>
        <div>
          <label htmlFor="emp-email" className="block text-xs text-muted-foreground mb-1">E-mail de contato</label>
          <input id="emp-email" {...campo('email')} inputMode="email" placeholder="contato@empresa.com.br" className={cls} />
        </div>
        <div>
          <label htmlFor="emp-site" className="block text-xs text-muted-foreground mb-1">Site</label>
          <input id="emp-site" {...campo('site')} placeholder="www.empresa.com.br" className={cls} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="cta" loading={salvando} onClick={salvar}>Salvar dados</Button>
        {msg && <p className={'text-xs ' + (msg.ok ? 'text-green-400' : 'text-red-400')} data-testid="dados-empresa-msg">{msg.texto}</p>}
      </div>
    </div>
  )
}
