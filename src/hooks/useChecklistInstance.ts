import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface ChecklistItemSnapshot {
  id: string
  label: string
  fields: { id: string; type: string; options: string[] }[]
  is_required: boolean
  position: number
}

export interface ChecklistInstance {
  instanceId: string
  title: string
  status: 'pendente' | 'em_andamento' | 'concluido'
  recurrence: string | null
  client: { id: string; name: string } | null
  location: { id: string; name: string } | null
  items: ChecklistItemSnapshot[]
  answers: Record<string, { value: any; file_path?: string | null }>  // por item_id
}

export function temResposta(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'object') {
    return Object.values(value).some(v => {
      if (Array.isArray(v)) return v.length > 0
      return v !== null && v !== undefined && v !== ''
    })
  }
  return value !== ''
}

/**
 * Núcleo de leitura/preenchimento/conclusão de uma instância de checklist.
 * Aceita ou um `instanceId` direto (checklist avulso) ou um `orderId`
 * (resolve a instância única da OS, context_type='order' — fluxo atual).
 */
export function useChecklistInstance(params: { instanceId?: string; orderId?: string }) {
  const { instanceId, orderId } = params
  const [checklist, setChecklist] = useState<ChecklistInstance | null>(null)
  const [loading, setLoading] = useState(true)

  const resolveInstanceId = useCallback(async (): Promise<string | null> => {
    if (instanceId) return instanceId
    if (!orderId) return null
    const { data: inst } = await supabase
      .from('checklist_instances')
      .select('id')
      .eq('order_id', orderId)
      .eq('context_type', 'order')
      .maybeSingle()
    return inst?.id ?? null
  }, [instanceId, orderId])

  const fetchChecklist = useCallback(async () => {
    setLoading(true)
    const id = await resolveInstanceId()
    if (!id) { setChecklist(null); setLoading(false); return }

    const { data: inst } = await supabase
      .from('checklist_instances')
      .select('*, client:clients(id, name), location:locations(id, name)')
      .eq('id', id)
      .maybeSingle()

    if (!inst) { setChecklist(null); setLoading(false); return }

    const { data: items } = await supabase
      .from('checklist_template_items')
      .select('*')
      .eq('template_id', inst.template_id)
      .order('position', { ascending: true })

    const { data: ans } = await supabase
      .from('checklist_answers')
      .select('*')
      .eq('instance_id', inst.id)

    const answers: Record<string, any> = {}
    for (const a of ans ?? []) {
      answers[a.item_id] = { value: a.value, file_path: a.file_path }
    }

    setChecklist({
      instanceId: inst.id,
      title: inst.title_snapshot,
      status: inst.status,
      recurrence: inst.recurrence ?? null,
      client: inst.client ?? null,
      location: inst.location ?? null,
      items: (items ?? []).map((it: any) => ({
        id: it.id, label: it.label, fields: Array.isArray(it.fields) ? it.fields : [],
        is_required: it.is_required, position: it.position,
      })),
      answers,
    })
    setLoading(false)
  }, [resolveInstanceId])

  useEffect(() => { fetchChecklist() }, [fetchChecklist])

  // Realtime: recarrega quando a instância muda (ex: admin reabre)
  useEffect(() => {
    const canalId = instanceId ?? orderId
    if (!canalId) return
    const canal = supabase
      .channel('checklist-instance-' + canalId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'checklist_instances' },
        () => { fetchChecklist() }
      )
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [instanceId, orderId, fetchChecklist])

  async function salvarResposta(itemId: string, item: ChecklistItemSnapshot, value: any, filePath?: string | null) {
    if (!checklist) return
    const { data: existente } = await supabase
      .from('checklist_answers')
      .select('id')
      .eq('instance_id', checklist.instanceId)
      .eq('item_id', itemId)
      .maybeSingle()

    const payload = {
      instance_id: checklist.instanceId, item_id: itemId,
      label_snapshot: item.label, response_type: 'multi',
      value, file_path: filePath ?? null,
    }
    if (existente) {
      await supabase.from('checklist_answers').update(payload).eq('id', existente.id)
    } else {
      await supabase.from('checklist_answers').insert(payload)
    }
    if (checklist.status === 'pendente') {
      await supabase.from('checklist_instances').update({ status: 'em_andamento' }).eq('id', checklist.instanceId)
    }
    setChecklist(prev => prev ? { ...prev, status: prev.status === 'pendente' ? 'em_andamento' : prev.status, answers: { ...prev.answers, [itemId]: { value, file_path: filePath ?? null } } } : prev)
  }

  function obrigatoriosPendentes(): number {
    if (!checklist) return 0
    return checklist.items.filter(it => it.is_required && !temResposta(checklist.answers[it.id]?.value)).length
  }

  async function concluir() {
    if (!checklist) return
    const { error } = await supabase
      .from('checklist_instances')
      .update({ status: 'concluido', completed_at: new Date().toISOString(), completed_by: (await supabase.auth.getUser()).data.user?.id ?? null })
      .eq('id', checklist.instanceId)
    if (error) throw error
    await fetchChecklist()
  }

  async function reabrir() {
    if (!checklist) return
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('checklist_instances')
      .update({ status: 'em_andamento', reopened_at: new Date().toISOString(), reopened_by: user?.id ?? null })
      .eq('id', checklist.instanceId)
    if (error) throw error
    await fetchChecklist()
  }

  return { checklist, loading, fetchChecklist, salvarResposta, obrigatoriosPendentes, concluir, reabrir }
}
