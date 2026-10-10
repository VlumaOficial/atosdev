import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AnexoChamado } from '@/lib/portalChamados'

export interface OrderComment {
  id: string
  order_id: string
  user_id: string | null
  author_name: string | null
  comment: string
  created_at: string
  visibilidade: 'interno' | 'cliente'
  autor_portal_id: string | null
  anexos: AnexoChamado[]   // fotos que o cliente mandou nesta mensagem
}

export function useOrderComments(orderId: string | undefined) {
  const [comments, setComments] = useState<OrderComment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchComments = useCallback(async () => {
    if (!orderId) { setLoading(false); return }
    setLoading(true)
    const [c, a] = await Promise.all([
      supabase.from('order_comments').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
      supabase.from('os_anexos_cliente').select('id, path, nome, tipo, mime, bytes, comentario_id').eq('order_id', orderId).not('comentario_id', 'is', null),
    ])
    if (!c.error && c.data) {
      const porComentario = new Map<string, AnexoChamado[]>()
      for (const x of (a.data ?? []) as (AnexoChamado & { comentario_id: string })[]) porComentario.set(x.comentario_id, [...(porComentario.get(x.comentario_id) ?? []), x])
      setComments((c.data as Omit<OrderComment, 'anexos'>[]).map(x => ({ ...x, anexos: porComentario.get(x.id) ?? [] })))
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  // "Nota interna" (nunca sai da empresa) ou "Responder ao cliente" (aparece no portal)
  async function addComment(text: string, visibilidade: 'interno' | 'cliente' = 'interno') {
    if (!orderId) return
    const { error } = await supabase.rpc('os_comentar', { p_order: orderId, p_texto: text, p_visibilidade: visibilidade })
    if (error) throw error
    await fetchComments()
  }

  return { comments, loading, fetchComments, addComment }
}
