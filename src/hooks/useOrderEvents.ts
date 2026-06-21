import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface OrderEvent {
  id: string
  order_id: string
  event_type: string
  actor_id: string | null
  actor_name: string | null
  details: Record<string, any>
  created_at: string
}

export function useOrderEvents(orderId: string | undefined) {
  const [events, setEvents] = useState<OrderEvent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEvents = useCallback(async () => {
    if (!orderId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
    if (!error && data) setEvents(data as OrderEvent[])
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  return { events, loading, fetchEvents }
}
