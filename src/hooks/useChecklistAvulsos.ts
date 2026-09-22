import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface ChecklistAvulso {
  id: string
  tenant_id: string
  template_id: string
  title_snapshot: string
  status: 'pendente' | 'em_andamento' | 'concluido'
  recurrence: string | null
  client_id: string | null
  location_id: string | null
  created_at: string
  client?: { id: string; name: string } | null
  location?: { id: string; name: string } | null
  targets?: { technician: { id: string; name: string } }[]
}

export interface ChecklistAvulsoInput {
  template_id: string
  title: string
  client_id?: string | null
  location_id?: string | null
  recurrence?: string | null
  technician_ids: string[]
}

const SELECT = `
  *,
  client:clients(id, name),
  location:locations(id, name),
  targets:checklist_instance_targets(technician:users(id, name))
`

export function useChecklistAvulsos() {
  const [checklists, setChecklists] = useState<ChecklistAvulso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchChecklists = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('checklist_instances')
      .select(SELECT)
      .eq('context_type', 'avulso')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setChecklists([])
    } else {
      setChecklists(data as unknown as ChecklistAvulso[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchChecklists()
  }, [fetchChecklists])

  async function createChecklistAvulso(input: ChecklistAvulsoInput) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: created, error } = await supabase
      .from('checklist_instances')
      .insert({
        template_id: input.template_id,
        title_snapshot: input.title,
        context_type: 'avulso',
        client_id: input.client_id || null,
        location_id: input.location_id || null,
        recurrence: input.recurrence || null,
        status: 'pendente',
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()
    if (error) throw error

    if (created?.id && input.technician_ids.length > 0) {
      const rows = input.technician_ids.map(technician_id => ({ instance_id: created.id, technician_id }))
      const { error: targetsError } = await supabase.from('checklist_instance_targets').insert(rows)
      if (targetsError) throw targetsError
    }

    await fetchChecklists()
    return created?.id as string | undefined
  }

  async function deleteChecklistAvulso(id: string) {
    const { error } = await supabase.from('checklist_instances').delete().eq('id', id)
    if (error) throw error
    await fetchChecklists()
  }

  return { checklists, loading, error, fetchChecklists, createChecklistAvulso, deleteChecklistAvulso }
}
