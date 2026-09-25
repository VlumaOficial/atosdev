import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { removerArquivosDoChecklist } from '@/lib/armazenamento'

export interface ChecklistAvulso {
  id: string
  tenant_id: string
  template_id: string
  title_snapshot: string
  status: 'pendente' | 'em_andamento' | 'concluido'
  recurrence: string | null
  serie_id: string | null
  data_prevista: string | null
  prazo: string | null
  client_id: string | null
  location_id: string | null
  created_at: string
  client?: { id: string; name: string } | null
  location?: { id: string; name: string } | null
  targets?: { technician: { id: string; name: string } }[]
  situacao?: 'concluido' | 'atrasado' | 'hoje' | 'proximo'
}

export interface ChecklistAvulsoInput {
  template_id: string
  title: string
  client_id?: string | null
  location_id?: string | null
  recurrence?: string | null
  technician_ids: string[]
  data_prevista?: string | null
  prazo?: string | null
}

// Série de recorrência (migration 038) — as ocorrências são geradas pelo banco
export interface ChecklistSerie {
  id: string
  template_id: string
  titulo: string
  client_id: string | null
  location_id: string | null
  tecnicos: string[]
  regra: any
  resumo: string
  inicio: string
  termino_tipo: 'nunca' | 'apos' | 'em'
  termino_qtd: number | null
  termino_data: string | null
  prazo_dias: number
  situacao: 'ativa' | 'pausada' | 'encerrada'
  proxima?: string | null
  client?: { id: string; name: string } | null
  location?: { id: string; name: string } | null
}

// Página de ocorrências filtrada no servidor (migration 040) — nunca a
// lista inteira (o Supabase corta em 1.000 linhas sem avisar)
export interface FiltrosAvulsos {
  situacao?: string; q?: string; de?: string | null; ate?: string | null
  cliente?: string; unidade?: string; tecnico?: string; modelo?: string; serie?: string
}
export type ContagensAvulsos = Record<'aberto' | 'atrasado' | 'hoje' | 'proximo' | 'em_andamento' | 'concluido' | 'todos', number>

export function useListaAvulsos(filtros: FiltrosAvulsos, pagina: number, tamanho: number) {
  const [itens, setItens] = useState<ChecklistAvulso[]>([])
  const [total, setTotal] = useState(0)
  const [contagens, setContagens] = useState<ContagensAvulsos | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const chave = JSON.stringify([filtros, pagina, tamanho])

  const buscar = useCallback(async () => {
    setLoading(true)
    const p: Record<string, string> = {}
    for (const [k, v] of Object.entries(filtros)) if (v) p[k] = v
    const { data, error } = await supabase.rpc('listar_checklists_avulsos', { p, p_pagina: pagina, p_tamanho: tamanho })
    if (error) { setError(error.message); setItens([]); setTotal(0) }
    else {
      const r = data as { total: number; itens: ChecklistAvulso[]; contagens: ContagensAvulsos }
      setError(null); setItens(r.itens); setTotal(r.total); setContagens(r.contagens)
    }
    setLoading(false)
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { buscar() }, [buscar])
  return { itens, total, contagens, loading, error, recarregar: buscar }
}

export async function createChecklistAvulso(input: ChecklistAvulsoInput) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: created, error } = await supabase
    .from('checklist_instances')
    .insert({
      template_id: input.template_id,
      title_snapshot: input.title,
      context_type: 'avulso',
      client_id: input.client_id || null,
      location_id: input.location_id || null,
      recurrence: input.recurrence || null,
      data_prevista: input.data_prevista || null,
      prazo: input.prazo || input.data_prevista || null,
      status: 'pendente',
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  if (created?.id && input.technician_ids.length > 0) {
    const rows = input.technician_ids.map(technician_id => ({ instance_id: created.id, technician_id }))
    const { error: targetsError } = await supabase.from('checklist_instance_targets').insert(rows)
    if (targetsError) throw targetsError
  }
  return created?.id as string | undefined
}

export async function deleteChecklistAvulso(id: string) {
  const { error } = await supabase.from('checklist_instances').delete().eq('id', id)
  if (error) throw error
  await removerArquivosDoChecklist(id).catch(() => {})
}

export function useChecklistSeries() {
  const [series, setSeries] = useState<ChecklistSerie[]>([])
  const [loading, setLoading] = useState(true)
  const fetchSeries = useCallback(async () => {
    const [{ data }, { data: prox }] = await Promise.all([
      supabase.from('checklist_series').select('*, client:clients(id, name), location:locations(id, name)').order('situacao').order('titulo'),
      supabase.rpc('proximas_das_series'),
    ])
    const mapa = new Map(((prox ?? []) as { serie_id: string; proxima: string }[]).map(x => [x.serie_id, x.proxima]))
    setSeries(((data ?? []) as ChecklistSerie[]).map(s => ({ ...s, proxima: mapa.get(s.id) ?? null })))
    setLoading(false)
  }, [])
  useEffect(() => { fetchSeries() }, [fetchSeries])
  return { series, loading, fetchSeries }
}
