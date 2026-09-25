import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/hooks/useOrders'

const SELECT = '*, client:clients(id, name), location:locations(id, name, address, city, state), technician:users!orders_technician_id_fkey(id, name)'

// Em aberto: todas. Concluídas/canceladas: só dos últimos N dias (30 por
// vez, "Ver mais antigas") — nunca o histórico inteiro de uma vez
// (decisão 2026-09-25; o Supabase corta em 1.000 linhas sem avisar)
const FINALIZADAS = '(concluida,cancelada)'

export function useMyOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dias, setDias] = useState(30)
  const [temMaisAntigas, setTemMaisAntigas] = useState(false)
  const userIdRef = useRef<string | null>(null)

  const fetchOrders = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setOrders([]); setLoading(false); return }
    userIdRef.current = user.id
    const desde = new Date(Date.now() - dias * 86400000).toISOString()
    const [abertas, finalizadas, antigas] = await Promise.all([
      supabase.from('orders').select(SELECT).eq('technician_id', user.id)
        .not('status', 'in', FINALIZADAS).order('created_at', { ascending: false }),
      supabase.from('orders').select(SELECT).eq('technician_id', user.id)
        .in('status', ['concluida', 'cancelada']).gte('updated_at', desde).order('updated_at', { ascending: false }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('technician_id', user.id)
        .in('status', ['concluida', 'cancelada']).lt('updated_at', desde),
    ])
    const erro = abertas.error ?? finalizadas.error
    if (erro) {
      setError(erro.message)
      setOrders([])
    } else {
      setError(null)
      setOrders([...(abertas.data as Order[]), ...(finalizadas.data as Order[])])
      setTemMaisAntigas((antigas.count ?? 0) > 0)
    }
    setLoading(false)
  }, [dias])

  const verMaisAntigas = useCallback(() => setDias(d => d + 30), [])

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

  return { orders, loading, error, fetchOrders, dias, temMaisAntigas, verMaisAntigas }
}
