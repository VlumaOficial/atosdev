import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { removerArquivosDaOS } from '@/lib/armazenamento'
import { registrarEvento } from '@/lib/orderEvents'

export type OrderStatus = 'aberta' | 'agendada' | 'em_andamento' | 'pausada' | 'concluida' | 'cancelada'
export type OrderPriority = 'normal' | 'alta' | 'urgente'

export interface Order {
  id: string
  tenant_id: string
  number: string
  client_id: string
  location_id: string | null
  technician_id: string | null
  title: string
  description: string | null
  priority: OrderPriority
  status: OrderStatus
  scheduled_at: string | null
  schedule_reason: string | null
  pause_reason: string | null
  cancel_reason: string | null
  started_at: string | null
  completed_at: string | null
  completion_notes: string | null
  signature_path: string | null
  signer_name: string | null
  signed_at: string | null
  require_signature: boolean | null
  created_at: string
  client?: { id: string; name: string } | null
  location?: { id: string; name: string; address?: string | null; city?: string | null; state?: string | null } | null
  technician?: { id: string; name: string } | null
  signature_absent_reason?: string | null
  technician_signature_path?: string | null
  technician_signer_name?: string | null
  technician_signed_at?: string | null
}

export interface OrderInput {
  client_id: string
  location_id?: string | null
  technician_id?: string | null
  title: string
  description?: string | null
  priority: OrderPriority
  require_signature?: boolean | null
}


// Página de OS filtrada no servidor (migration 041) — nunca a lista inteira
export interface FiltrosOS {
  situacao?: string; q?: string; de?: string | null; ate?: string | null
  cliente?: string; unidade?: string; tecnico?: string; prioridade?: string
}
export type ContagensOS = Record<'todas' | 'em_aberto' | OrderStatus, number>

export function useListaOS(filtros: FiltrosOS, pagina: number, tamanho: number) {
  const [itens, setItens] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [contagens, setContagens] = useState<ContagensOS | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const chave = JSON.stringify([filtros, pagina, tamanho])
  const buscar = useCallback(async () => {
    setLoading(true)
    const p: Record<string, string> = {}
    for (const [k, v] of Object.entries(filtros)) if (v) p[k] = v
    const { data, error } = await supabase.rpc('listar_os', { p, p_pagina: pagina, p_tamanho: tamanho })
    if (error) { setError(error.message); setItens([]); setTotal(0) }
    else {
      const r = data as { total: number; itens: Order[]; contagens: ContagensOS }
      setError(null); setItens(r.itens); setTotal(r.total); setContagens(r.contagens)
    }
    setLoading(false)
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { buscar() }, [buscar])
  return { itens, total, contagens, loading, error, recarregar: buscar }
}

// Ações de OS (criar, editar, status, excluir) — a lista é recarregada por quem chama
export function useOrders() {
  async function createOrder(input: OrderInput) {
    const { data: { user } } = await supabase.auth.getUser()
    const payload: any = {
      client_id: input.client_id,
      location_id: input.location_id || null,
      technician_id: input.technician_id || null,
      title: input.title,
      description: input.description || null,
      priority: input.priority,
      require_signature: input.require_signature ?? null,
      created_by: user?.id ?? null,
    }
    const { data: created, error } = await supabase.from('orders').insert(payload).select('id').single()
    if (error) throw error
    if (created?.id) {
      await registrarEvento(created.id, 'created', { technician_id: payload.technician_id ?? null })
    }
    return created?.id as string | undefined
  }

  async function updateOrder(id: string, input: Partial<OrderInput>) {
    // estado anterior para detectar transferência de técnico
    const { data: anteriorRow } = await supabase.from('orders')
      .select('technician_id, technician:users!orders_technician_id_fkey(id, name)').eq('id', id).single()
    const anterior = anteriorRow as unknown as Pick<Order, 'technician_id' | 'technician'> | null
    // normaliza campos UUID: string vazia -> null (Postgres rejeita "" em uuid)
    const clean: any = { ...input }
    if (clean.location_id !== undefined) clean.location_id = clean.location_id || null
    if (clean.technician_id !== undefined) clean.technician_id = clean.technician_id || null
    if (clean.description !== undefined) clean.description = clean.description || null
    const { error } = await supabase.from('orders').update(clean).eq('id', id)
    if (error) throw error

    // transferência de técnico
    if (clean.technician_id !== undefined && anterior && (clean.technician_id || null) !== (anterior.technician_id || null)) {
      await registrarEvento(id, 'transferred', {
        from_technician_id: anterior.technician_id ?? null,
        from_technician_name: anterior.technician?.name ?? null,
        to_technician_id: clean.technician_id ?? null,
      })
    } else {
      // edição de dados (registrada, mas não destacada na linha do tempo)
      await registrarEvento(id, 'edited', {})
    }

  }

  async function changeStatus(
    id: string,
    status: OrderStatus,
    extra?: { scheduled_at?: string; schedule_reason?: string; pause_reason?: string; cancel_reason?: string }
  ) {
    const patch: any = { status }
    if (status === 'agendada') {
      patch.scheduled_at = extra?.scheduled_at ?? null
      patch.schedule_reason = extra?.schedule_reason ?? null
    }
    if (status === 'em_andamento') {
      patch.started_at = new Date().toISOString()
    }
    if (status === 'pausada') {
      patch.pause_reason = extra?.pause_reason ?? null
    }
    if (status === 'concluida') {
      patch.completed_at = new Date().toISOString()
    }
    if (status === 'cancelada') {
      patch.cancel_reason = extra?.cancel_reason ?? null
    }
    const { error } = await supabase.from('orders').update(patch).eq('id', id)
    if (error) throw error
  }

  async function deleteOrder(id: string) {
    // ids dos checklists ANTES da exclusão (a cascata apaga os registros,
    // e depois não dá mais pra saber quais pastas de foto eram dela)
    const { data: checklists } = await supabase.from('checklist_instances').select('id').eq('order_id', id)
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) throw error
    await removerArquivosDaOS(id, (checklists ?? []).map(c => c.id)).catch(() => {})
  }

  return { createOrder, updateOrder, changeStatus, deleteOrder }
}
