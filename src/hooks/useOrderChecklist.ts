import { supabase } from '@/lib/supabase'
import { useChecklistInstance, type ChecklistItemSnapshot, type ChecklistInstance as OrderChecklist } from '@/hooks/useChecklistInstance'

export type { ChecklistItemSnapshot, OrderChecklist }

/**
 * Checklist vinculado a uma OS (um por OS, context_type='order').
 * associar/desassociar são específicos deste fluxo — o resto delega
 * para useChecklistInstance, compartilhado com o checklist avulso.
 */
export function useOrderChecklist(orderId: string | undefined) {
  const base = useChecklistInstance({ orderId })

  async function associar(templateId: string, titulo: string) {
    if (!orderId) return
    const { error } = await supabase.from('checklist_instances').insert({
      template_id: templateId, title_snapshot: titulo, context_type: 'order', order_id: orderId, status: 'pendente',
    })
    if (error) throw error
    await base.fetchChecklist()
  }

  async function desassociar() {
    if (!base.checklist) return
    const { error } = await supabase.from('checklist_instances').delete().eq('id', base.checklist.instanceId)
    if (error) throw error
    await base.fetchChecklist()
  }

  return { ...base, associar, desassociar }
}
