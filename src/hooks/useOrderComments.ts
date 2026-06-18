import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface OrderComment {
  id: string
  order_id: string
  user_id: string | null
  author_name: string | null
  comment: string
  created_at: string
}

export function useOrderComments(orderId: string | undefined) {
  const [comments, setComments] = useState<OrderComment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchComments = useCallback(async () => {
    if (!orderId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('order_comments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
    if (!error && data) setComments(data as OrderComment[])
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  async function addComment(text: string) {
    if (!orderId) return
    const { data: { user } } = await supabase.auth.getUser()
    let authorName: string | null = null
    if (user) {
      const { data: perfil } = await supabase.from('users').select('name').eq('id', user.id).single()
      authorName = perfil?.name ?? user.email ?? null
    }
    const { error } = await supabase.from('order_comments').insert({
      order_id: orderId,
      user_id: user?.id ?? null,
      author_name: authorName,
      comment: text,
    })
    if (error) throw error
    await fetchComments()
  }

  return { comments, loading, fetchComments, addComment }
}
