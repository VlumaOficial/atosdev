import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { SecaoRecolhivel } from '@/components/ui/secao-recolhivel'
import { Button } from '@/components/ui/button'
import { Eraser, Loader2, Download, AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import { formatarBytes } from '@/lib/armazenamento'
import { listarFotosParaExportar, gerarZip, nomeDoZip } from '@/lib/exportacaoFotos'
import { nomeEmpresa } from '@/lib/empresa'

// "Liberar espaço" (decisões do usuário 2026-09-24): o cliente escolhe o
// período (data de conclusão/cancelamento da OS) e o nível —
//  1. fotos originais + miniaturas, MANTENDO o relatório PDF (as fotos
//     ficam nele). PDFs faltantes são gerados antes; OS sem PDF (ex.:
//     cancelada) não entra no nível 1
//  2. fotos + PDFs — exige baixar o ZIP do período antes
// Sempre: prévia do que sai, confirmação digitada, histórico. Assinaturas,
// logo, dados da OS e códigos de verificação ficam.

const FRASE = 'LIBERAR ESPAÇO'
interface Previa { qtd_os: number; qtd_fotos: number; qtd_pdfs: number; bytes: number; os_ids: string[]; os_sem_pdf: string[] }
interface Historico { id: string; executado_em: string; periodo_de: string; periodo_ate: string; nivel: number; qtd_os: number; qtd_arquivos: number; bytes: number; executado_por: string | null }

const dataBR = (d: string) => new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR')

export default function LiberarEspacoCard() {
  const { tenant } = useAuth()
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [nivel, setNivel] = useState<1 | 2>(1)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [zipOk, setZipOk] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [executando, setExecutando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState('')
  const [historico, setHistorico] = useState<Historico[]>([])
  const [nomes, setNomes] = useState<Record<string, string>>({})

  async function carregarHistorico() {
    const { data } = await supabase.from('liberacoes_espaco').select('*').order('executado_em', { ascending: false }).limit(20)
    const h = (data as Historico[]) ?? []
    setHistorico(h)
    const ids = [...new Set(h.map(x => x.executado_por).filter(Boolean))] as string[]
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, name').in('id', ids)
      setNomes(Object.fromEntries((us ?? []).map((u: any) => [u.id, u.name])))
    }
  }
  useEffect(() => { carregarHistorico() }, [])

  function mudou(fn: () => void) { fn(); setPrevia(null); setZipOk(false); setConfirmacao(''); setResultado(''); setErro('') }

  async function calcular() {
    setErro(''); setResultado('')
    if (!de || !ate) { setErro('Escolha o período (de e até).'); return }
    if (de > ate) { setErro('A data inicial não pode ser depois da final.'); return }
    setCalculando(true)
    const { data, error } = await supabase.rpc('previa_liberar_espaco', { p_de: de, p_ate: ate, p_nivel: nivel })
    setCalculando(false)
    if (error) { setErro(error.message); return }
    setPrevia((data as Previa[])?.[0] ?? null)
  }

  async function gerarPdfsFaltantes() {
    if (!previa) return
    setErro('')
    for (let i = 0; i < previa.os_sem_pdf.length; i++) {
      setProgresso(`Gerando relatório ${i + 1} de ${previa.os_sem_pdf.length}...`)
      await supabase.functions.invoke('gerar-relatorio-os', { body: { order_id: previa.os_sem_pdf[i] } }).catch(() => null)
    }
    setProgresso('')
    await calcular()
  }

  async function baixarZip() {
    if (!previa) return
    setErro('')
    try {
      setProgresso('Preparando o ZIP...')
      const itens = await listarFotosParaExportar({ orderIds: previa.os_ids })
      await gerarZip(itens, nomeDoZip(nomeEmpresa(tenant) || 'empresa', de, ate, 'antes-de-liberar'), p => setProgresso(`Baixando ${p.baixadas} de ${p.total}...`))
      setZipOk(true)
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível gerar o ZIP.')
    } finally {
      setProgresso('')
    }
  }

  async function liberar() {
    if (!previa) return
    setErro(''); setExecutando(true)
    try {
      const { data, error } = await supabase.rpc('arquivos_para_liberar', { p_de: de, p_ate: ate, p_nivel: nivel })
      if (error) throw error
      const arquivos = (data as { nome: string; bytes: number }[]) ?? []
      const removidos: string[] = []
      let bytes = 0
      for (let i = 0; i < arquivos.length; i += 100) {
        const lote = arquivos.slice(i, i + 100)
        setProgresso(`Apagando ${Math.min(i + 100, arquivos.length)} de ${arquivos.length}...`)
        const { error: e } = await supabase.storage.from('evidencias').remove(lote.map(a => a.nome))
        if (!e) { removidos.push(...lote.map(a => a.nome)); bytes += lote.reduce((s, a) => s + Number(a.bytes), 0) }
      }
      const { error: eReg } = await supabase.rpc('registrar_liberacao', { p_de: de, p_ate: ate, p_nivel: nivel, p_removidos: removidos, p_bytes: bytes })
      if (eReg) throw eReg
      setResultado(`${formatarBytes(bytes)} liberados — ${removidos.length} ${removidos.length === 1 ? 'arquivo' : 'arquivos'} de ${previa.qtd_os} OS.${removidos.length < arquivos.length ? ` ${arquivos.length - removidos.length} não puderam ser apagados.` : ''}`)
      setPrevia(null); setConfirmacao(''); setZipOk(false)
      carregarHistorico()
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível liberar o espaço.')
    } finally {
      setExecutando(false); setProgresso('')
    }
  }

  const precisaPdf = nivel === 1 && !!previa && previa.os_sem_pdf.length > 0
  const precisaZip = nivel === 2 && !zipOk
  const temAlgo = !!previa && previa.bytes > 0
  const podeLiberar = temAlgo && !precisaPdf && !precisaZip && confirmacao.trim().toUpperCase() === FRASE && !executando
  const campo = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <SecaoRecolhivel id="liberar-espaco" icone={<Eraser size={16} className="text-primary" />}
      titulo="Liberar espaço"
      descricao="Apague fotos (e, se quiser, relatórios) de OS antigas concluídas ou canceladas. Os dados da OS, assinaturas e códigos de verificação continuam."
      resumo={historico[0] ? <>Última: {dataBR(historico[0].executado_em)}</> : undefined}>
      <div className="space-y-4" data-testid="liberar-espaco">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="lib-de" className="block text-xs text-muted-foreground mb-1">OS concluídas/canceladas de</label>
            <input id="lib-de" type="date" value={de} max={ate || undefined} onChange={e => mudou(() => setDe(e.target.value))} className={campo} />
          </div>
          <div>
            <label htmlFor="lib-ate" className="block text-xs text-muted-foreground mb-1">até</label>
            <input id="lib-ate" type="date" value={ate} min={de || undefined} onChange={e => mudou(() => setAte(e.target.value))} className={campo} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {([1, 2] as const).map(n => (
            <button key={n} type="button" onClick={() => mudou(() => setNivel(n))} aria-pressed={nivel === n} data-testid={'nivel-' + n}
              className={'text-left rounded-md border p-3 transition ' + (nivel === n ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary')}>
              <p className="text-sm font-medium text-foreground">{n === 1 ? 'Nível 1 — Fotos' : 'Nível 2 — Fotos e relatórios'}{n === 1 && <span className="ml-1.5 text-[10px] text-green-400">recomendado</span>}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{n === 1
                ? 'Apaga as fotos originais. O relatório PDF de cada OS fica guardado, com as fotos dentro.'
                : 'Apaga fotos e relatórios PDF. Exige baixar o ZIP do período antes.'}</p>
            </button>
          ))}
        </div>

        <Button type="button" variant="outline" onClick={calcular} disabled={calculando || executando}>
          {calculando && <Loader2 size={14} className="animate-spin" />} Calcular
        </Button>

        {previa && (
          <div className="rounded-md border border-border p-3 space-y-3" data-testid="previa-liberar">
            {!temAlgo ? (
              <p className="text-sm text-muted-foreground">Nada a liberar nesse período{nivel === 1 && previa.qtd_os > 0 ? ' no nível 1 (OS sem relatório PDF só entram no nível 2)' : ''}.</p>
            ) : (
              <p className="text-sm text-foreground">
                <strong>{formatarBytes(previa.bytes)}</strong> serão liberados: {previa.qtd_fotos} {previa.qtd_fotos === 1 ? 'foto' : 'fotos'}
                {nivel === 2 && <> e {previa.qtd_pdfs} {previa.qtd_pdfs === 1 ? 'relatório PDF' : 'relatórios PDF'}</>} de {previa.qtd_os} OS.
              </p>
            )}

            {precisaPdf && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-amber-300">
                <FileText size={14} /> {previa.os_sem_pdf.length} OS ainda sem relatório PDF — gere antes, para as fotos ficarem registradas.
                <Button type="button" variant="outline" onClick={gerarPdfsFaltantes} disabled={!!progresso}>Gerar relatórios que faltam</Button>
              </div>
            )}

            {nivel === 2 && temAlgo && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {zipOk
                  ? <span className="inline-flex items-center gap-1 text-green-400"><CheckCircle2 size={14} /> ZIP do período baixado</span>
                  : <><span className="text-amber-300">Obrigatório: baixe o ZIP com as fotos e relatórios antes de apagar.</span>
                      <Button type="button" variant="outline" onClick={baixarZip} disabled={!!progresso}><Download size={14} /> Baixar ZIP do período</Button></>}
              </div>
            )}

            {temAlgo && !precisaPdf && !precisaZip && (
              <div className="space-y-2">
                <p className="text-xs text-red-300 flex items-start gap-1.5"><AlertTriangle size={14} className="flex-shrink-0 mt-px" /> Esta ação não pode ser desfeita. Para confirmar, digite <strong>{FRASE}</strong>.</p>
                <input value={confirmacao} onChange={e => setConfirmacao(e.target.value)} placeholder={FRASE} aria-label="Confirmação" className={campo + ' sm:w-72'} />
                <div>
                  <Button type="button" variant="danger" onClick={liberar} disabled={!podeLiberar}>
                    {executando && <Loader2 size={14} className="animate-spin" />} Liberar {formatarBytes(previa.bytes)}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {progresso && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> {progresso}</p>}
        {erro && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{erro}</div>}
        {resultado && <p className="text-sm text-green-400" data-testid="liberar-resultado">{resultado}</p>}

        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium text-foreground">Histórico</p>
          {historico.length === 0 ? <p className="text-xs text-muted-foreground mt-1">Nenhuma liberação feita.</p> : (
            <div className="mt-1 divide-y divide-border" data-testid="historico-liberacao">
              {historico.map(h => (
                <div key={h.id} className="py-1.5 text-xs flex flex-wrap justify-between gap-2">
                  <span className="text-foreground">{new Date(h.executado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {nomes[h.executado_por ?? ''] ?? '—'}</span>
                  <span className="text-muted-foreground">Nível {h.nivel} · OS de {dataBR(h.periodo_de)} a {dataBR(h.periodo_ate)} · {h.qtd_arquivos} {h.qtd_arquivos === 1 ? 'arquivo' : 'arquivos'} · {formatarBytes(Number(h.bytes))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SecaoRecolhivel>
  )
}
