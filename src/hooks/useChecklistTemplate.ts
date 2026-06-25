import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export type FieldType = 'sim_nao' | 'texto' | 'numero' | 'escolha_unica' | 'escolha_multipla' | 'foto'

export interface ResponseField {
  id: string            // id local (React)
  type: FieldType
  options: string[]     // só para escolha_unica/escolha_multipla
}

export interface TemplateItem {
  id: string            // id real (uuid) ou temporário (temp-...)
  label: string
  fields: ResponseField[]
  is_required: boolean
  position: number
}

export interface TemplateData {
  id: string | null
  name: string
  description: string
  client_id: string | null
  is_active: boolean
  items: TemplateItem[]
}

export function useChecklistTemplate(templateId: string | undefined) {
  const isNew = !templateId || templateId === 'novo'
  const [data, setData] = useState<TemplateData>({
    id: null, name: '', description: '', client_id: null, is_active: true, items: [],
  })
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplate = useCallback(async () => {
    if (isNew) { setLoading(false); return }
    setLoading(true)
    const { data: tpl, error: e1 } = await supabase
      .from('checklist_templates').select('*').eq('id', templateId).single()
    if (e1 || !tpl) { setError(e1?.message ?? 'Modelo não encontrado'); setLoading(false); return }
    const { data: items, error: e2 } = await supabase
      .from('checklist_template_items').select('*').eq('template_id', templateId).order('position', { ascending: true })
    if (e2) { setError(e2.message); setLoading(false); return }
    setData({
      id: tpl.id, name: tpl.name, description: tpl.description ?? '', client_id: tpl.client_id, is_active: tpl.is_active,
      items: (items ?? []).map((it: any) => ({
        id: it.id,
        label: it.label,
        fields: Array.isArray(it.fields) ? it.fields : [],
        is_required: it.is_required,
        position: it.position,
      })),
    })
    setLoading(false)
  }, [templateId, isNew])

  useEffect(() => { fetchTemplate() }, [fetchTemplate])

  async function save(payload: TemplateData): Promise<string> {
    let templateRealId = payload.id

    if (!templateRealId) {
      const { data: created, error } = await supabase
        .from('checklist_templates')
        .insert({ name: payload.name, description: payload.description || null, client_id: payload.client_id, is_active: payload.is_active })
        .select('id').single()
      if (error) throw error
      templateRealId = created.id
    } else {
      const { error } = await supabase
        .from('checklist_templates')
        .update({ name: payload.name, description: payload.description || null, client_id: payload.client_id, is_active: payload.is_active })
        .eq('id', templateRealId)
      if (error) throw error
    }

    const { data: existentes } = await supabase
      .from('checklist_template_items').select('id').eq('template_id', templateRealId)
    const idsExistentes = new Set((existentes ?? []).map((r: any) => r.id))
    const idsMantidos = new Set(payload.items.filter(i => !i.id.startsWith('temp-')).map(i => i.id))

    const remover = [...idsExistentes].filter(id => !idsMantidos.has(id))
    if (remover.length > 0) {
      await supabase.from('checklist_template_items').delete().in('id', remover)
    }

    for (let idx = 0; idx < payload.items.length; idx++) {
      const it = payload.items[idx]
      const base = {
        template_id: templateRealId,
        label: it.label,
        fields: it.fields ?? [],
        is_required: it.is_required,
        position: idx,
      }
      if (it.id.startsWith('temp-')) {
        await supabase.from('checklist_template_items').insert(base)
      } else {
        await supabase.from('checklist_template_items').update(base).eq('id', it.id)
      }
    }

    return templateRealId as string
  }

  return { data, setData, loading, error, isNew, save, fetchTemplate }
}
