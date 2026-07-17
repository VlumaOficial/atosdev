import { supabase } from '@/lib/supabase'

function temResposta(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'object') {
    return Object.values(value).some(v => Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && v !== ''))
  }
  return value !== ''
}

// Retorna quantos itens obrigatórios do checklist da OS ainda não foram respondidos.
// 0 = pode concluir (ou não há checklist / não há obrigatórios).
export async function checklistObrigatoriosPendentes(orderId: string): Promise<number> {
  // instância de checklist da OS
  const { data: inst } = await supabase
    .from('checklist_instances')
    .select('id, template_id, status')
    .eq('order_id', orderId)
    .eq('context_type', 'order')
    .maybeSingle()

  if (!inst) return 0  // sem checklist, nada a exigir

  // itens obrigatórios do modelo
  const { data: items } = await supabase
    .from('checklist_template_items')
    .select('id, is_required')
    .eq('template_id', inst.template_id)

  const obrigatorios = (items ?? []).filter((it: any) => it.is_required)
  if (obrigatorios.length === 0) return 0

  // respostas já dadas
  const { data: ans } = await supabase
    .from('checklist_answers')
    .select('item_id, value')
    .eq('instance_id', inst.id)

  const respostasPorItem: Record<string, any> = {}
  for (const a of ans ?? []) respostasPorItem[a.item_id] = a.value

  return obrigatorios.filter((it: any) => !temResposta(respostasPorItem[it.id])).length
}
