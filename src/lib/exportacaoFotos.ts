import { downloadZip } from 'client-zip'
import { supabase } from '@/lib/supabase'

// Exportação das fotos em ZIP, montado NO NAVEGADOR (decisão 2026-09-23):
// nenhum arquivo temporário é criado no servidor — então não existe o que
// apagar depois nem limite de memória/tempo de Edge Function. O navegador
// baixa cada foto (URL assinada), monta o ZIP e entrega o download.
//
// Conteúdo: evidências da OS, fotos de itens de checklist (de OS e
// avulsos) e assinaturas do cliente, no período escolhido (data da foto),
// com filtro opcional por cliente ou por OS. Pastas por OS + planilha
// fotos.csv (separador ";" e BOM — abre direto no Excel em pt-BR).

const BUCKET = 'evidencias'
const CONCORRENCIA = 4

export interface FiltroExportacao {
  de?: string          // ISO (inclusive)
  ate?: string         // ISO (inclusive)
  clienteId?: string
  orderId?: string
}

export interface ItemExportacao {
  caminho: string      // no bucket
  pasta: string        // no ZIP
  arquivo: string      // no ZIP
  tipo: 'Evidência da OS' | 'Foto de checklist' | 'Assinatura do cliente'
  os: string
  cliente: string
  unidade: string
  checklistItem: string
  autor: string
  dataHora: string     // ISO
  observacao: string
}

function limpar(nome: string): string {
  return nome.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'sem nome'
}

function carimboArquivo(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

function pastaDaOS(numero: string | null, cliente: string, unidade: string): string {
  return limpar([numero ?? 'OS', cliente, unidade].filter(Boolean).join(' - '))
}

async function mapaUsuarios(): Promise<Map<string, string>> {
  const { data } = await supabase.from('users').select('id, name')
  return new Map((data ?? []).map(u => [u.id as string, u.name as string]))
}

// Monta a lista do que vai no ZIP (sem baixar nada ainda) — permite
// mostrar a contagem antes de o usuário confirmar
export async function listarFotosParaExportar(f: FiltroExportacao): Promise<ItemExportacao[]> {
  const usuarios = await mapaUsuarios()
  const itens: ItemExportacao[] = []
  const noPeriodo = (iso: string | null) =>
    !!iso && (!f.de || iso >= f.de) && (!f.ate || iso <= f.ate)

  // 1) evidências da OS
  let qEv = supabase
    .from('order_evidences')
    .select('file_path, observacao, created_at, created_by, order_id, orders(number, client_id, clients(name), locations(name))')
    .order('created_at')
  if (f.orderId) qEv = qEv.eq('order_id', f.orderId)
  if (f.de) qEv = qEv.gte('created_at', f.de)
  if (f.ate) qEv = qEv.lte('created_at', f.ate)
  const { data: evidencias, error: e1 } = await qEv
  if (e1) throw e1
  for (const ev of (evidencias ?? []) as any[]) {
    const o = ev.orders
    if (f.clienteId && o?.client_id !== f.clienteId) continue
    const cliente = o?.clients?.name ?? ''
    const unidade = o?.locations?.name ?? ''
    itens.push({
      caminho: ev.file_path,
      pasta: pastaDaOS(o?.number, cliente, unidade),
      arquivo: `${carimboArquivo(ev.created_at)}_evidencia.jpg`,
      tipo: 'Evidência da OS', os: o?.number ?? '', cliente, unidade, checklistItem: '',
      autor: usuarios.get(ev.created_by) ?? '', dataHora: ev.created_at, observacao: ev.observacao ?? '',
    })
  }

  // 2) fotos de checklist (valor da resposta = {campo: caminho})
  let qCk = supabase
    .from('checklist_answers')
    .select('value, label_snapshot, answered_at, answered_by, checklist_instances!inner(id, title_snapshot, order_id, client_id, clients(name), locations(name), orders(number, client_id, clients(name), locations(name)))')
    .order('answered_at')
  if (f.orderId) qCk = qCk.eq('checklist_instances.order_id', f.orderId)
  // a resposta é gravada no mesmo momento ou depois da foto, então
  // answered_at >= "de" nunca descarta foto do período (o "até" é
  // conferido pela data da própria foto, logo abaixo)
  if (f.de) qCk = qCk.gte('answered_at', f.de)
  const { data: respostas, error: e2 } = await qCk
  if (e2) throw e2
  for (const r of (respostas ?? []) as any[]) {
    if (!r.value || typeof r.value !== 'object' || Array.isArray(r.value)) continue
    const inst = r.checklist_instances
    const o = inst?.orders
    const clienteId = o?.client_id ?? inst?.client_id
    if (f.clienteId && clienteId !== f.clienteId) continue
    const cliente = o?.clients?.name ?? inst?.clients?.name ?? ''
    const unidade = o?.locations?.name ?? inst?.locations?.name ?? ''
    for (const v of Object.values(r.value)) {
      if (typeof v !== 'string' || !v.includes('/checklist/') || !/\.jpg$/i.test(v)) continue
      // data da foto = carimbo no nome do arquivo (ms), cai para a resposta
      const ms = Number(v.match(/-(\d{13})\.jpg$/i)?.[1])
      const dataHora = ms ? new Date(ms).toISOString() : r.answered_at
      if (!noPeriodo(dataHora)) continue
      const pasta = o
        ? pastaDaOS(o.number, cliente, unidade)
        : 'Checklists avulsos/' + limpar([inst?.title_snapshot, cliente, unidade].filter(Boolean).join(' - '))
      itens.push({
        caminho: v, pasta,
        arquivo: `${carimboArquivo(dataHora)}_checklist_${limpar(r.label_snapshot ?? 'item').slice(0, 40)}.jpg`,
        tipo: 'Foto de checklist', os: o?.number ?? '', cliente, unidade,
        checklistItem: `${inst?.title_snapshot ?? ''} › ${r.label_snapshot ?? ''}`,
        autor: usuarios.get(r.answered_by) ?? '', dataHora, observacao: '',
      })
    }
  }

  // 3) assinaturas
  let qAs = supabase
    .from('orders')
    .select('id, number, client_id, signature_path, signer_name, signed_at, technician_id, clients(name), locations(name)')
    .not('signature_path', 'is', null)
  if (f.orderId) qAs = qAs.eq('id', f.orderId)
  if (f.clienteId) qAs = qAs.eq('client_id', f.clienteId)
  if (f.de) qAs = qAs.gte('signed_at', f.de)
  if (f.ate) qAs = qAs.lte('signed_at', f.ate)
  const { data: assinaturas, error: e3 } = await qAs
  if (e3) throw e3
  for (const o of (assinaturas ?? []) as any[]) {
    const cliente = o.clients?.name ?? ''
    const unidade = o.locations?.name ?? ''
    itens.push({
      caminho: o.signature_path,
      pasta: pastaDaOS(o.number, cliente, unidade),
      arquivo: `assinatura_${limpar(o.signer_name ?? 'cliente')}.png`,
      tipo: 'Assinatura do cliente', os: o.number ?? '', cliente, unidade, checklistItem: '',
      autor: o.signer_name ?? '', dataHora: o.signed_at ?? '', observacao: 'Assinado por ' + (o.signer_name ?? ''),
    })
  }

  // nomes únicos dentro de cada pasta (duas fotos no mesmo minuto)
  const usados = new Set<string>()
  for (const it of itens) {
    let nome = it.arquivo
    let n = 2
    while (usados.has(`${it.pasta}/${nome}`)) nome = it.arquivo.replace(/(\.\w+)$/, `_${n++}$1`)
    it.arquivo = nome
    usados.add(`${it.pasta}/${nome}`)
  }
  return itens.sort((a, b) => a.pasta.localeCompare(b.pasta) || a.dataHora.localeCompare(b.dataHora))
}

function planilha(itens: ItemExportacao[], faltando: Set<string>): string {
  const cab = ['Pasta', 'Arquivo', 'Tipo', 'OS', 'Cliente', 'Unidade', 'Checklist / item', 'Autor', 'Data e hora', 'Observação', 'Situação']
  const esc = (v: string) => /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const linhas = itens.map(it => [
    it.pasta, it.arquivo, it.tipo, it.os, it.cliente, it.unidade, it.checklistItem, it.autor,
    it.dataHora ? new Date(it.dataHora).toLocaleString('pt-BR') : '', it.observacao,
    faltando.has(it.caminho) ? 'Arquivo não encontrado' : 'OK',
  ].map(v => esc(String(v ?? ''))).join(';'))
  return '﻿' + [cab.join(';'), ...linhas].join('\r\n')
}

export interface ProgressoExportacao { baixadas: number; total: number }

// Baixa as fotos (URLs assinadas em lote, poucas em paralelo), monta o
// ZIP e dispara o download. Nada fica guardado em lugar nenhum além do
// computador do usuário.
export async function gerarZip(
  itens: ItemExportacao[],
  nomeZip: string,
  onProgresso?: (p: ProgressoExportacao) => void
): Promise<{ faltando: number }> {
  const caminhos = [...new Set(itens.map(i => i.caminho))]
  const urls = new Map<string, string>()
  for (let i = 0; i < caminhos.length; i += 100) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos.slice(i, i + 100), 600)
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl)
  }

  const blobs = new Map<string, Blob>()
  const faltando = new Set<string>()
  let baixadas = 0
  let proximo = 0
  async function trabalhador() {
    while (proximo < caminhos.length) {
      const caminho = caminhos[proximo++]
      const url = urls.get(caminho)
      try {
        const r = url ? await fetch(url) : null
        if (r?.ok) blobs.set(caminho, await r.blob())
        else faltando.add(caminho)
      } catch {
        faltando.add(caminho)
      }
      onProgresso?.({ baixadas: ++baixadas, total: caminhos.length })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, caminhos.length) }, trabalhador))

  const arquivos = itens
    .filter(it => blobs.has(it.caminho))
    .map(it => ({ name: `${it.pasta}/${it.arquivo}`, input: blobs.get(it.caminho)!, lastModified: it.dataHora ? new Date(it.dataHora) : new Date() }))
  arquivos.push({ name: 'fotos.csv', input: new Blob([planilha(itens, faltando)], { type: 'text/csv' }), lastModified: new Date() })

  const zip = await downloadZip(arquivos).blob()
  const url = URL.createObjectURL(zip)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeZip
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000) // libera a memória do navegador
  return { faltando: faltando.size }
}

export function nomeDoZip(empresa: string, de?: string, ate?: string, sufixo?: string): string {
  const d = (iso?: string) => iso ? iso.slice(0, 10) : ''
  const periodo = de || ate ? `_${d(de) || 'inicio'}_a_${d(ate) || 'hoje'}` : ''
  return `ATOS_fotos_${limpar(empresa).replace(/\s+/g, '_').slice(0, 30)}${sufixo ? '_' + limpar(sufixo) : ''}${periodo}.zip`
}
