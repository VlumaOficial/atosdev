import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface MyChecklist {
  id: string
  title_snapshot: string
  status: 'pendente' | 'em_andamento' | 'concluido'
  recurrence: string | null
  data_prevista: string | null
  prazo: string | null
  completed_at?: string | null
  created_at: string
  client?: { id: string; name: string } | null
  location?: { id: string; name: string } | null
}

const SELECT = `
  instance_id,
  checklist_instances!inner (
    id, title_snapshot, status, recurrence, data_prevista, prazo, created_at, completed_at,
    client:clients(id, name), location:locations(id, name)
  )
`

// Em aberto: todos. Concluídos: só dos últimos N dias (30 por vez,
// "Ver mais antigos") — decisão 2026-09-25
export function useMyChecklists() {
  const [checklists, setChecklists] = useState<MyChecklist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dias, setDias] = useState(30)
  const [temMaisAntigos, setTemMaisAntigos] = useState(false)

  const fetchChecklists = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setChecklists([]); setLoading(false); return }
    const desde = new Date(Date.now() - dias * 86400000).toISOString()
    const [abertos, concluidos, antigos] = await Promise.all([
      supabase.from('checklist_instance_targets').select(SELECT).eq('technician_id', user.id)
        .neq('checklist_instances.status', 'concluido'),
      supabase.from('checklist_instance_targets').select(SELECT).eq('technician_id', user.id)
        .eq('checklist_instances.status', 'concluido').gte('checklist_instances.completed_at', desde),
      supabase.from('checklist_instance_targets').select('instance_id, checklist_instances!inner(id)', { count: 'exact', head: true })
        .eq('technician_id', user.id).eq('checklist_instances.status', 'concluido').lt('checklist_instances.completed_at', desde),
    ])
    const erro = abertos.error ?? concluidos.error
    if (erro) {
      setError(erro.message)
      setChecklists([])
    } else {
      setError(null)
      const linhas = [...(abertos.data ?? []), ...(concluidos.data ?? [])]
      setChecklists(linhas.map((row: any) => row.checklist_instances).filter(Boolean) as MyChecklist[])
      setTemMaisAntigos((antigos.count ?? 0) > 0)
    }
    setLoading(false)
  }, [dias])

  const verMaisAntigos = useCallback(() => setDias(d => d + 30), [])

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

  return { checklists, loading, error, fetchChecklists, dias, temMaisAntigos, verMaisAntigos }
}
