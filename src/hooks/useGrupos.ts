import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { NivelGrupo } from '@/lib/grupos'

// Grupos de atendimento da empresa (migration 057)
export interface Grupo {
  id: string
  nome: string
  descricao: string | null
  nivel: NivelGrupo
  assumir: boolean
  ativo: boolean
}
export interface MembroGrupo { grupo_id: string; user_id: string; coordenador: boolean }

export function useGrupos() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [membros, setMembros] = useState<MembroGrupo[]>([])
  const [carregando, setCarregando] = useState(true)
  const recarregar = useCallback(async () => {
    const [g, m] = await Promise.all([
      supabase.from('grupos_atendimento').select('id, nome, descricao, nivel, assumir, ativo').order('nome'),
      supabase.from('grupo_membros').select('grupo_id, user_id, coordenador'),
    ])
    setGrupos((g.data ?? []) as Grupo[])
    setMembros((m.data ?? []) as MembroGrupo[])
    setCarregando(false)
  }, [])
  useEffect(() => { recarregar() }, [recarregar])
  const ativos = grupos.filter(g => g.ativo)
  return { grupos, ativos, membros, carregando, recarregar }
}
