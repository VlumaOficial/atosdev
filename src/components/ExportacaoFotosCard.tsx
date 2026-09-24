import { useState, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useClients } from '@/hooks/useClients'
import { SecaoRecolhivel } from '@/components/ui/secao-recolhivel'
import { Combobox } from '@/components/ui/combobox'
import { Button } from '@/components/ui/button'
import { FileArchive, Loader2, Download, Search } from 'lucide-react'
import { listarFotosParaExportar, gerarZip, nomeDoZip, type ItemExportacao } from '@/lib/exportacaoFotos'
import { nomeEmpresa } from '@/lib/empresa'

// Exportação das fotos (evidências, fotos de checklist e assinaturas) em
// ZIP, em Configurações. Período pela data da foto + cliente opcional.
// Duas etapas de propósito: "Verificar" mostra quantos arquivos entram
// (sem baixar nada); "Baixar ZIP" faz o download de fato.

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function diasAtrasISO(dias: number): string {
  const d = new Date(Date.now() - dias * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// datas do input são locais; o banco guarda UTC — converte início/fim do dia local
const inicioDoDia = (d: string) => new Date(d + 'T00:00:00').toISOString()
const fimDoDia = (d: string) => new Date(d + 'T23:59:59.999').toISOString()

export default function ExportacaoFotosCard() {
  const { tenant } = useAuth()
  const { clients } = useClients()
  const [de, setDe] = useState(diasAtrasISO(30))
  const [ate, setAte] = useState(hojeISO())
  const [clienteId, setClienteId] = useState('')
  const [itens, setItens] = useState<ItemExportacao[] | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [progresso, setProgresso] = useState<{ baixadas: number; total: number } | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const opcoesCliente = useMemo(() => [
    { value: '', label: 'Todos os clientes' },
    ...clients.map(c => ({ value: c.id, label: c.name })),
  ], [clients])

  const porTipo = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of itens ?? []) m[it.tipo] = (m[it.tipo] ?? 0) + 1
    return m
  }, [itens])
  const pastas = useMemo(() => new Set((itens ?? []).map(i => i.pasta)).size, [itens])

  function mudouFiltro(fn: () => void) {
    fn()
    setItens(null)
    setAviso('')
  }

  async function verificar() {
    setErro(''); setAviso('')
    if (de && ate && de > ate) { setErro('A data inicial não pode ser depois da final.'); return }
    setVerificando(true)
    try {
      setItens(await listarFotosParaExportar({
        de: de ? inicioDoDia(de) : undefined,
        ate: ate ? fimDoDia(ate) : undefined,
        clienteId: clienteId || undefined,
      }))
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível listar as fotos.')
    } finally {
      setVerificando(false)
    }
  }

  async function baixar() {
    if (!itens?.length) return
    setErro(''); setAviso('')
    setProgresso({ baixadas: 0, total: itens.length })
    try {
      const cliente = clients.find(c => c.id === clienteId)?.name
      const { faltando } = await gerarZip(itens, nomeDoZip(nomeEmpresa(tenant) || 'empresa', de, ate, cliente), setProgresso)
      setAviso(faltando
        ? `ZIP gerado. ${faltando} ${faltando === 1 ? 'arquivo não foi encontrado' : 'arquivos não foram encontrados'} — marcados na planilha fotos.csv.`
        : 'ZIP gerado e baixado. Nenhum arquivo fica guardado no servidor.')
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível gerar o ZIP.')
    } finally {
      setProgresso(null)
    }
  }

  const campo = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <SecaoRecolhivel id="exportacao" icone={<FileArchive size={16} className="text-primary" />}
      titulo="Exportar fotos"
      descricao="Baixe em um arquivo ZIP as fotos de evidência, fotos de checklist e assinaturas, organizadas por OS, com uma planilha descrevendo cada arquivo.">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="exp-de" className="block text-xs text-muted-foreground mb-1">De</label>
          <input id="exp-de" type="date" value={de} max={ate || undefined} onChange={e => mudouFiltro(() => setDe(e.target.value))} className={campo} />
        </div>
        <div>
          <label htmlFor="exp-ate" className="block text-xs text-muted-foreground mb-1">Até</label>
          <input id="exp-ate" type="date" value={ate} min={de || undefined} onChange={e => mudouFiltro(() => setAte(e.target.value))} className={campo} />
        </div>
        <div>
          <label htmlFor="exp-cliente" className="block text-xs text-muted-foreground mb-1">Cliente</label>
          <Combobox id="exp-cliente" options={opcoesCliente} value={clienteId} onChange={v => mudouFiltro(() => setClienteId(v))}
            placeholder="Todos os clientes" searchPlaceholder="Buscar cliente..." />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={verificar} disabled={verificando || !!progresso}>
          {verificando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Verificar fotos do período
        </Button>
        {itens && itens.length > 0 && (
          <Button type="button" variant="cta" onClick={baixar} disabled={!!progresso}>
            {progresso ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {progresso ? `Baixando ${progresso.baixadas} de ${progresso.total}...` : `Baixar ZIP (${itens.length} ${itens.length === 1 ? 'arquivo' : 'arquivos'})`}
          </Button>
        )}
      </div>

      {itens && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="exportacao-resumo">
          {itens.length === 0
            ? 'Nenhuma foto no período e filtro escolhidos.'
            : <>{itens.length} {itens.length === 1 ? 'arquivo' : 'arquivos'} em {pastas} {pastas === 1 ? 'pasta' : 'pastas'} —{' '}
                {Object.entries(porTipo).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(', ')}.</>}
        </p>
      )}
      {aviso && <p className="mt-2 text-xs text-green-400" data-testid="exportacao-aviso">{aviso}</p>}
      {erro && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mt-3">{erro}</div>}
    </SecaoRecolhivel>
  )
}
