import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { uploadEvidenciaOS, removerEvidencia } from '@/lib/uploadEvidencia'
import type { Coordenadas } from '@/lib/geolocation'

export interface OrderEvidence {
  id: string
  order_id: string
  file_path: string
  observacao: string | null
  created_by: string | null
  created_at: string
}

export function useOrderEvidences(orderId: string | undefined) {
  const [evidencias, setEvidencias] = useState<OrderEvidence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEvidencias = useCallback(async () => {
    if (!orderId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('order_evidences')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
    if (error) {
      setError(error.message)
      setEvidencias([])
    } else {
      setEvidencias(data as OrderEvidence[])
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    fetchEvidencias()
  }, [fetchEvidencias])

  async function adicionar(file: File, coords: Coordenadas) {
    if (!orderId) return
    const res = await uploadEvidenciaOS(file, orderId, coords)
    if (res.erro) throw new Error(res.erro)

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('order_evidences').insert({
      order_id: orderId,
      file_path: res.path,
      created_by: user?.id ?? null,
    })
    if (error) throw error
    await fetchEvidencias()
  }

  async function atualizarObservacao(id: string, texto: string) {
    const { error } = await supabase
      .from('order_evidences')
      .update({ observacao: texto || null })
      .eq('id', id)
    if (error) throw error
    await fetchEvidencias()
  }

  async function remover(id: string, filePath: string) {
    const { error } = await supabase.from('order_evidences').delete().eq('id', id)
    if (error) throw error
    await removerEvidencia(filePath)
    await fetchEvidencias()
  }

  return { evidencias, loading, error, fetchEvidencias, adicionar, atualizarObservacao, remover }
}
