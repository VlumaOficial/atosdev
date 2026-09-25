import { useState } from 'react'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { mascaraDocumento, cnpjValido } from '@/lib/empresa'
import { consultarCnpjReceita, formatarRazaoSocial, type DadosReceita } from '@/lib/cnpj'
import { Search, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

// Campo "CPF ou CNPJ" + botão Receita (só CNPJ) — Cliente e Unidade.
// Quem usa decide o que preencher com os dados devolvidos (onReceita).

interface Props {
  id: string
  valor: string
  onChange: (v: string) => void
  onReceita: (r: DadosReceita) => void | Promise<void>
  aviso?: string | null      // ex.: raiz do CNPJ diferente da do cliente
}

export default function DocumentoReceita({ id, valor, onChange, onReceita, aviso }: Props) {
  const [consultando, setConsultando] = useState(false)
  const [erro, setErro] = useState('')
  const [receita, setReceita] = useState<DadosReceita | null>(null)

  async function consultar() {
    setErro(''); setReceita(null)
    if (!cnpjValido(valor)) { setErro('A consulta à Receita é só para CNPJ válido (14 dígitos).'); return }
    setConsultando(true)
    const r = await consultarCnpjReceita(valor)
    if ('erro' in r) { setConsultando(false); setErro(r.erro); return }
    await onReceita(r)
    setConsultando(false)
    setReceita(r)
  }

  return (
    <div>
      <Label htmlFor={id}>CPF ou CNPJ</Label>
      <div className="flex gap-2">
        <Input id={id} value={valor} inputMode="numeric" placeholder="000.000.000-00 ou 00.000.000/0000-00"
          onChange={e => { onChange(mascaraDocumento(e.target.value)); setReceita(null); setErro('') }} />
        <Button type="button" variant="outline" onClick={consultar} disabled={consultando || valor.replace(/\D/g, '').length !== 14}
          title="Preenche com os dados da Receita Federal (só CNPJ)">
          {consultando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Receita
        </Button>
      </div>
      {erro && <p className="text-xs text-red-400 mt-1">{erro}</p>}
      {aviso && <p className="text-xs text-amber-300 mt-1" data-testid={id + '-aviso'}>{aviso}</p>}
      {receita && (
        <div className={'mt-2 rounded-md border px-3 py-2 text-xs ' + (receita.ativa ? 'border-green-500/30 bg-green-500/5 text-green-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-300')} data-testid={id + '-receita'}>
          <p className="flex items-center gap-1.5 font-medium">{receita.ativa ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {formatarRazaoSocial(receita.razaoSocial)} — {receita.situacao}</p>
          <p className="text-muted-foreground mt-0.5">Campos vazios e o endereço foram preenchidos com os dados da Receita. Confira antes de salvar.</p>
        </div>
      )}
    </div>
  )
}

// Raiz do CNPJ (8 primeiros dígitos) = mesma empresa (matriz e filiais)
export function raizCnpj(v: string | null | undefined): string | null {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length === 14 ? d.slice(0, 8) : null
}
