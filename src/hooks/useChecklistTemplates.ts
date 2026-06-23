import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface ChecklistTemplate {
  id: string
  tenant_id: string
  name: string
  description: string | null
  client_id: string | null
  is_active: boolean
  created_at: string
  client?: { id: string; name: string } | null
  item_count?: number
}

const SELECT = '*, client:clients(id, name), checklist_template_items(count)'

export function useChecklistTemplates() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('checklist_templates')
      .select(SELECT)
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setTemplates([])
    } else {
      const mapped = (data ?? []).map((t: any) => ({
        ...t,
        item_count: t.checklist_template_items?.[0]?.count ?? 0,
      }))
      setTemplates(mapped as ChecklistTemplate[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  async function toggleActive(id: string, is_active: boolean) {
    const { error } = await supabase.from('checklist_templates').update({ is_active }).eq('id', id)
    if (error) throw error
    await fetchTemplates()
  }

  async function deleteTemplate(id: string) {
    const { error } = await supabase.from('checklist_templates').delete().eq('id', id)
    if (error) throw error
    await fetchTemplates()
  }

  return { templates, loading, error, fetchTemplates, toggleActive, deleteTemplate }
}
