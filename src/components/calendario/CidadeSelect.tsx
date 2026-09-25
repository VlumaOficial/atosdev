import { useEffect, useMemo, useState } from 'react'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/input'
import { UFS, cidadesDaUf, type Cidade } from '@/lib/calendario'

// UF + cidade da lista oficial do IBGE (BrasilAPI). Guardar o CÓDIGO IBGE
// é o que permite aplicar feriado municipal sem depender de o nome da
// cidade ter sido digitado igual.

interface Props {
  uf: string
  ibge: string
  onChange: (v: { uf: string; ibge: string; nome: string }) => void
  idPrefixo?: string
  rotuloCidade?: string
}

export default function CidadeSelect({ uf, ibge, onChange, idPrefixo = 'cidade', rotuloCidade = 'Cidade' }: Props) {
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!uf) { setCidades([]); return }
    let vivo = true
    setCarregando(true)
    setErro('')
    cidadesDaUf(uf)
      .then(l => { if (vivo) setCidades(l) })
      .catch(() => { if (vivo) setErro('Não foi possível carregar as cidades. Tente de novo em instantes.') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [uf])

  const opcoesUf = useMemo(() => UFS.map(u => ({ value: u, label: u })), [])
  const opcoesCidade = useMemo(() => cidades.map(c => ({ value: c.ibge, label: c.nome })), [cidades])

  return (
    <div className="grid grid-cols-[88px_1fr] gap-3">
      <div>
        <Label htmlFor={idPrefixo + '-uf'}>UF</Label>
        <Combobox id={idPrefixo + '-uf'} options={opcoesUf} value={uf}
          onChange={v => onChange({ uf: v, ibge: '', nome: '' })}
          placeholder="UF" searchPlaceholder="UF..." emptyText="UF inválida." />
      </div>
      <div>
        <Label htmlFor={idPrefixo + '-nome'}>{rotuloCidade}</Label>
        <Combobox id={idPrefixo + '-nome'} options={opcoesCidade} value={ibge}
          onChange={v => onChange({ uf, ibge: v, nome: cidades.find(c => c.ibge === v)?.nome ?? '' })}
          placeholder={!uf ? 'Escolha a UF primeiro' : carregando ? 'Carregando cidades…' : 'Selecione a cidade'}
          searchPlaceholder="Buscar cidade..." emptyText={carregando ? 'Carregando…' : 'Nenhuma cidade encontrada.'} />
        {erro && <p className="text-xs text-red-400 mt-1">{erro}</p>}
      </div>
    </div>
  )
}
