import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface Client {
  id: string
  tenant_id: string
  name: string
  cnpj: string | null
  email: string | null
  phone: string | null
  address: string | null
  active: boolean
  created_at: string
  locations_count?: number
}

export interface ClientInput {
  name: string
  cnpj?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('clients')
      .select('*, locations(count)')
      .order('name', { ascending: true })
    if (error) {
      setError(error.message)
      setClients([])
    } else {
      const mapped = (data as any[]).map(c => ({
        ...c,
        locations_count: c.locations?.[0]?.count ?? 0,
      }))
      setClients(mapped as Client[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  async function createClient(input: ClientInput) {
    const { error } = await supabase.from('clients').insert(input)
    if (error) throw error
    await fetchClients()
  }

  async function updateClient(id: string, input: ClientInput) {
    const { error } = await supabase.from('clients').update(input).eq('id', id)
    if (error) throw error
    await fetchClients()
  }

  async function setClientActive(id: string, active: boolean) {
    const { error } = await supabase.from('clients').update({ active }).eq('id', id)
    if (error) throw error
    await fetchClients()
  }

  async function deleteClient(id: string) {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) throw error
    await fetchClients()
  }

  return { clients, loading, error, fetchClients, createClient, updateClient, deleteClient, setClientActive }
}
