import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface ChecklistItemSnapshot {
  id: string
  label: string
  fields: { id: string; type: string; options: string[] }[]
  is_required: boolean
  position: number
}

export interface OrderChecklist {
  instanceId: string
  title: string
  status: 'pendente' | 'em_andamento' | 'concluido'
  items: ChecklistItemSnapshot[]
  answers: Record<string, { value: any; file_path?: string | null }>  // por item_id
}

export function useOrderChecklist(orderId: string | undefined) {
  const [checklist, setChecklist] = useState<OrderChecklist | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchChecklist = useCallback(async () => {
    if (!orderId) { setLoading(false); return }
    setLoading(true)
    // instância de checklist desta OS (um por OS)
    const { data: inst } = await supabase
      .from('checklist_instances')
      .select('*')
      .eq('order_id', orderId)
      .eq('context_type', 'order')
      .maybeSingle()

    if (!inst) { setChecklist(null); setLoading(false); return }

    // itens do modelo (snapshot vivo: lê do template)
    const { data: items } = await supabase
      .from('checklist_template_items')
      .select('*')
      .eq('template_id', inst.template_id)
      .order('position', { ascending: true })

    // respostas já dadas
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
      items: (items ?? []).map((it: any) => ({
        id: it.id, label: it.label, fields: Array.isArray(it.fields) ? it.fields : [],
        is_required: it.is_required, position: it.position,
      })),
      answers,
    })
    setLoading(false)
  }, [orderId])

  useEffect(() => { fetchChecklist() }, [fetchChecklist])

  // associa um modelo à OS (cria a instância)
  async function associar(templateId: string, titulo: string) {
    if (!orderId) return
    const { error } = await supabase.from('checklist_instances').insert({
      template_id: templateId, title_snapshot: titulo, context_type: 'order', order_id: orderId, status: 'pendente',
    })
    if (error) throw error
    await fetchChecklist()
  }

  // remove o checklist da OS
  async function desassociar() {
    if (!checklist) return
    const { error } = await supabase.from('checklist_instances').delete().eq('id', checklist.instanceId)
    if (error) throw error
    await fetchChecklist()
  }

  // salva a resposta de um item (upsert por item)
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
    // marca instância como em andamento
    if (checklist.status === 'pendente') {
      await supabase.from('checklist_instances').update({ status: 'em_andamento' }).eq('id', checklist.instanceId)
    }
    setChecklist(prev => prev ? { ...prev, status: prev.status === 'pendente' ? 'em_andamento' : prev.status, answers: { ...prev.answers, [itemId]: { value, file_path: filePath ?? null } } } : prev)
  }

  // verifica se todos os itens obrigatórios foram respondidos
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

  return { checklist, loading, fetchChecklist, associar, desassociar, salvarResposta, obrigatoriosPendentes, concluir, reabrir }
}

function temResposta(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'object') {
    return Object.values(value).some(v => {
      if (Array.isArray(v)) return v.length > 0
      return v !== null && v !== undefined && v !== ''
    })
  }
  return value !== ''
}
