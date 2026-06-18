import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface Technician {
  id: string
  tenant_id: string | null
  name: string
  email: string
  phone: string | null
  role: string
  active: boolean
  created_at: string
}

export interface TechnicianInput {
  name: string
  email: string
  password: string
  phone?: string | null
}

export function useTechnicians() {
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTechnicians = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'tecnico')
      .order('name', { ascending: true })
    if (error) {
      setError(error.message)
      setTechnicians([])
    } else {
      setTechnicians(data as Technician[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTechnicians()
  }, [fetchTechnicians])

  // Cria técnico via Edge Function (cria login + perfil de forma segura)
  async function createTechnician(input: TechnicianInput) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const { data, error } = await supabase.functions.invoke('criar-tecnico', {
      body: input,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (error) {
      let message = 'Não foi possível cadastrar o técnico. Tente novamente.'
      try {
        const ctx = (error as any).context
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json()
          if (body?.error) message = body.error
        } else if (ctx && typeof ctx.text === 'function') {
          const text = await ctx.text()
          const parsed = JSON.parse(text)
          if (parsed?.error) message = parsed.error
        }
      } catch {
        // mantém mensagem padrão se não conseguir ler o corpo
      }
      throw new Error(message)
    }
    if (data?.error) throw new Error(data.error)
    await fetchTechnicians()
    return data
  }

  // Atualiza dados do técnico (não mexe em senha/email)
  async function updateTechnician(id: string, fields: { name?: string; phone?: string | null }) {
    const { error } = await supabase.from('users').update(fields).eq('id', id)
    if (error) throw error
    await fetchTechnicians()
  }

  async function setTechnicianActive(id: string, active: boolean) {
    const { error } = await supabase.from('users').update({ active }).eq('id', id)
    if (error) throw error
    await fetchTechnicians()
  }

  return { technicians, loading, error, fetchTechnicians, createTechnician, updateTechnician, setTechnicianActive }
}
