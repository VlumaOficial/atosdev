import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/hooks/useOrders'

const SELECT = '*, client:clients(id, name), location:locations(id, name, address, city, state), technician:users!orders_technician_id_fkey(id, name)'

export function useMyOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const userIdRef = useRef<string | null>(null)

  const fetchOrders = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setOrders([]); setLoading(false); return }
    userIdRef.current = user.id
    const { data, error } = await supabase
      .from('orders')
      .select(SELECT)
      .eq('technician_id', user.id)
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

  // Realtime: recarrega a lista quando uma OS do técnico muda/é criada
  useEffect(() => {
    const channel = supabase
      .channel('my-orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          // qualquer mudança em orders -> recarrega; o fetch já filtra pelo técnico (RLS + eq)
          fetchOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchOrders])

  return { orders, loading, error, fetchOrders }
}
