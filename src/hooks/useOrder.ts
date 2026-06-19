import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Order, OrderStatus } from '@/hooks/useOrders'

const SELECT = '*, client:clients(id, name), location:locations(id, name, address, city, state), technician:users!orders_technician_id_fkey(id, name)'

export function useOrder(id: string | undefined) {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrder = useCallback(async () => {
    if (!id) { setLoading(false); return }
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('orders')
      .select(SELECT)
      .eq('id', id)
      .single()
    if (error) {
      setError(error.message)
      setOrder(null)
    } else {
      setOrder(data as Order)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  async function changeStatus(
    status: OrderStatus,
    extra?: { scheduled_at?: string; schedule_reason?: string; pause_reason?: string; cancel_reason?: string; completion_notes?: string; completed_at?: string }
  ) {
    if (!id) return
    const patch: any = { status }
    if (status === 'agendada') {
      patch.scheduled_at = extra?.scheduled_at ?? null
      patch.schedule_reason = extra?.schedule_reason ?? null
    }
    if (status === 'em_andamento') patch.started_at = new Date().toISOString()
    if (status === 'pausada') patch.pause_reason = extra?.pause_reason ?? null
    if (status === 'concluida') {
      patch.completed_at = extra?.completed_at || new Date().toISOString()
      patch.completion_notes = extra?.completion_notes ?? null
    }
    if (status === 'cancelada') patch.cancel_reason = extra?.cancel_reason ?? null
    const { error } = await supabase.from('orders').update(patch).eq('id', id)
    if (error) throw error
    await fetchOrder()
  }

  return { order, loading, error, fetchOrder, changeStatus }
}
