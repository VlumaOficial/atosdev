import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface MyChecklist {
  id: string
  title_snapshot: string
  status: 'pendente' | 'em_andamento' | 'concluido'
  recurrence: string | null
  created_at: string
  client?: { id: string; name: string } | null
  location?: { id: string; name: string } | null
}

const SELECT = `
  instance_id,
  checklist_instances!inner (
    id, title_snapshot, status, recurrence, created_at,
    client:clients(id, name), location:locations(id, name)
  )
`

export function useMyChecklists() {
  const [checklists, setChecklists] = useState<MyChecklist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchChecklists = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setChecklists([]); setLoading(false); return }
    const { data, error } = await supabase
      .from('checklist_instance_targets')
      .select(SELECT)
      .eq('technician_id', user.id)
      .order('created_at', { referencedTable: 'checklist_instances', ascending: false })
    if (error) {
      setError(error.message)
      setChecklists([])
    } else {
      const mapped = (data ?? []).map((row: any) => row.checklist_instances).filter(Boolean)
      setChecklists(mapped as MyChecklist[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchChecklists() }, [fetchChecklists])

  // Realtime: recarrega quando uma instância atribuída ao técnico muda,
  // ou quando uma nova atribuição é criada
  useEffect(() => {
    const channel = supabase
      .channel('my-checklists-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_instances' }, () => fetchChecklists())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_instance_targets' }, () => fetchChecklists())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchChecklists])

  return { checklists, loading, error, fetchChecklists }
}
