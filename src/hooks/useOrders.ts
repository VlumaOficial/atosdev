import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
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
  created_at: string
  client?: { id: string; name: string } | null
  location?: { id: string; name: string; address?: string | null; city?: string | null; state?: string | null } | null
  technician?: { id: string; name: string } | null
}

export interface OrderInput {
  client_id: string
  location_id?: string | null
  technician_id?: string | null
  title: string
  description?: string | null
  priority: OrderPriority
}

const SELECT = '*, client:clients(id, name), location:locations(id, name), technician:users!orders_technician_id_fkey(id, name)'

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('orders')
      .select(SELECT)
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setOrders([])
    } else {
      setOrders(data as Order[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  async function createOrder(input: OrderInput) {
    const { data: { user } } = await supabase.auth.getUser()
    const payload: any = {
      client_id: input.client_id,
      location_id: input.location_id || null,
      technician_id: input.technician_id || null,
      title: input.title,
      description: input.description || null,
      priority: input.priority,
      created_by: user?.id ?? null,
    }
    const { data: created, error } = await supabase.from('orders').insert(payload).select('id').single()
    if (error) throw error
    if (created?.id) {
      await registrarEvento(created.id, 'created', { technician_id: payload.technician_id ?? null })
    }
    await fetchOrders()
    return created?.id as string | undefined
  }

  async function updateOrder(id: string, input: Partial<OrderInput>) {
    // estado anterior para detectar transferência de técnico
    const anterior = orders.find(o => o.id === id)
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

    await fetchOrders()
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
    await fetchOrders()
  }

  async function deleteOrder(id: string) {
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) throw error
    await fetchOrders()
  }

  return { orders, loading, error, fetchOrders, createOrder, updateOrder, changeStatus, deleteOrder }
}
