import { useState } from 'react'
import { Input, Label } from '@/components/ui/input'
import CidadeSelect from '@/components/calendario/CidadeSelect'
import { consultarCep, mascaraCep, type Endereco } from '@/lib/endereco'
import { Loader2 } from 'lucide-react'

// Endereço estruturado (Cliente → Unidade principal, e Unidade). O CEP
// preenche rua, bairro, UF e cidade; número e complemento são digitados.
// UF + cidade são obrigatórias (feriados e SLA dependem delas).

interface Props {
  valor: Endereco
  onChange: (e: Endereco) => void
  idPrefixo: string
  textoLegado?: string | null   // endereço antigo em texto livre, se ainda não estruturado
}

export default function EnderecoForm({ valor, onChange, idPrefixo, textoLegado }: Props) {
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState('')
  const set = (k: keyof Endereco, v: string) => onChange({ ...valor, [k]: v })

  async function mudarCep(txt: string) {
    const cep = mascaraCep(txt)
    onChange({ ...valor, cep })
    setAviso('')
    if (cep.replace(/\D/g, '').length !== 8) return
    setBuscando(true)
    const r = await consultarCep(cep)
    setBuscando(false)
    if ('erro' in r) { setAviso(r.erro); return }
    onChange({
      ...valor, cep,
      logradouro: r.logradouro || valor.logradouro,
      bairro: r.bairro || valor.bairro,
      uf: r.uf || valor.uf,
      cidade_ibge: r.cidade_ibge || valor.cidade_ibge,
      cidade: r.cidade_ibge ? (r.cidade ?? '') : valor.cidade,
    })
    if (!r.cidade_ibge) setAviso('CEP encontrado, mas escolha a cidade na lista.')
  }

  return (
    <div className="space-y-3" data-endereco={idPrefixo}>
      {textoLegado && !valor.cidade_ibge && (
        <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5">
          Endereço antigo (texto livre): "{textoLegado}". Complete os campos abaixo — a cidade é obrigatória.
        </p>
      )}
      <div className="grid grid-cols-[130px_1fr] gap-3">
        <div>
          <Label htmlFor={idPrefixo + '-cep'}>CEP</Label>
          <div className="relative">
            <Input id={idPrefixo + '-cep'} value={valor.cep} inputMode="numeric" placeholder="00000-000"
              onChange={e => mudarCep(e.target.value)} />
            {buscando && <Loader2 size={14} className="animate-spin text-muted-foreground absolute right-2.5 top-3" />}
          </div>
        </div>
        <div>
          <Label htmlFor={idPrefixo + '-logradouro'}>Rua / Logradouro</Label>
          <Input id={idPrefixo + '-logradouro'} value={valor.logradouro} onChange={e => set('logradouro', e.target.value)} placeholder="Rua, avenida, praça..." />
        </div>
      </div>
      {aviso && <p className="text-xs text-amber-300 -mt-1">{aviso}</p>}
      <div className="grid grid-cols-[100px_1fr] gap-3">
        <div>
          <Label htmlFor={idPrefixo + '-numero'}>Número</Label>
          <Input id={idPrefixo + '-numero'} value={valor.numero} onChange={e => set('numero', e.target.value)} placeholder="S/N" />
        </div>
        <div>
          <Label htmlFor={idPrefixo + '-complemento'}>Complemento</Label>
          <Input id={idPrefixo + '-complemento'} value={valor.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Sala, loja, bloco..." />
        </div>
      </div>
      <div>
        <Label htmlFor={idPrefixo + '-bairro'}>Bairro</Label>
        <Input id={idPrefixo + '-bairro'} value={valor.bairro} onChange={e => set('bairro', e.target.value)} />
      </div>
      <CidadeSelect idPrefixo={idPrefixo} uf={valor.uf} ibge={valor.cidade_ibge} rotuloCidade="Cidade *"
        onChange={v => onChange({ ...valor, uf: v.uf, cidade_ibge: v.ibge, cidade: v.nome })} />
    </div>
  )
}
