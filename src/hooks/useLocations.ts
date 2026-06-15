import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface Location {
  id: string
  tenant_id: string
  client_id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  active: boolean
  created_at: string
  client?: { id: string; name: string } | null
}

export interface LocationInput {
  client_id: string
  name: string
  address?: string | null
  city?: string | null
  state?: string | null
}

export function useLocations(clientId?: string) {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLocations = useCallback(async () => {
    setLoading(true)
    setError(null)
    let query = supabase
      .from('locations')
      .select('*, client:clients(id, name)')
      .order('name', { ascending: true })
    if (clientId) {
      query = query.eq('client_id', clientId)
    }
    const { data, error } = await query
    if (error) {
      setError(error.message)
      setLocations([])
    } else {
      setLocations(data as Location[])
    }
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    fetchLocations()
  }, [fetchLocations])

  async function createLocation(input: LocationInput) {
    const { error } = await supabase.from('locations').insert(input)
    if (error) throw error
    await fetchLocations()
  }

  async function updateLocation(id: string, input: Partial<LocationInput>) {
    const { error } = await supabase.from('locations').update(input).eq('id', id)
    if (error) throw error
    await fetchLocations()
  }

  async function deleteLocation(id: string) {
    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) throw error
    await fetchLocations()
  }

  return { locations, loading, error, fetchLocations, createLocation, updateLocation, deleteLocation }
}
