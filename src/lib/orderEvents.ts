import { supabase } from '@/lib/supabase'

export type OrderEventType =
  | 'created'
  | 'started'
  | 'paused'
  | 'resumed'
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'reopened'
  | 'transferred'
  | 'edited'

// Registra um evento na OS de forma centralizada (autor capturado do usuário logado)
export async function registrarEvento(
  orderId: string,
  eventType: OrderEventType,
  details: Record<string, any> = {}
) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    let actorName: string | null = null
    if (user) {
      const { data: perfil } = await supabase.from('users').select('name').eq('id', user.id).single()
      actorName = perfil?.name ?? user.email ?? null
    }
    await supabase.from('order_events').insert({
      order_id: orderId,
      event_type: eventType,
      actor_id: user?.id ?? null,
      actor_name: actorName,
      details,
    })
  } catch (e) {
    // não bloqueia a ação principal se o registro de evento falhar
    if (import.meta.env.DEV) console.error('Falha ao registrar evento:', e)
  }
}
