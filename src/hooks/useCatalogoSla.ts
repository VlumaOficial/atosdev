import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Catálogo de serviços, motivos de pausa e políticas de SLA da empresa (migration 044)

export interface Categoria {
  id: string
  pai_id: string | null
  nome: string
  impacto: string | null
  urgencia: string | null
  ativo: boolean
  descricao_portal: string | null
  visivel_portal: boolean | null   // nulo = o admin ainda não decidiu (não aparece no portal)
  tipos_portal: string[]
  grupo_padrao_id: string | null
}
export interface MotivoPausa { id: string; nome: string; para_sla: boolean; ativo: boolean; ordem: number; comportamento: 'interno' | 'comunica' | 'aciona'; texto_cliente: string | null; exige_previsao: boolean }
export interface PoliticaSla {
  id: string
  nivel: string
  client_id: string | null
  categoria_id: string | null
  horario_id: string | null
  resposta_min: number | null
  atendimento_min: number
  solucao_min: number
  ativo: boolean
}

export function useCategorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const recarregar = useCallback(async () => {
    const { data } = await supabase.from('os_categorias').select('id, pai_id, nome, impacto, urgencia, ativo, descricao_portal, visivel_portal, tipos_portal, grupo_padrao_id').order('nome')
    setCategorias((data ?? []) as Categoria[])
    setCarregando(false)
  }, [])
  useEffect(() => { recarregar() }, [recarregar])
  // opções para combobox: "CFTV" e "CFTV › Câmera sem imagem"
  const opcoes = useMemo(() => {
    const pais = categorias.filter(c => !c.pai_id)
    const l: { value: string; label: string }[] = []
    for (const p of pais) {
      if (p.ativo) l.push({ value: p.id, label: p.nome })
      for (const f of categorias.filter(c => c.pai_id === p.id && c.ativo)) l.push({ value: f.id, label: `${p.nome} › ${f.nome}` })
    }
    return l
  }, [categorias])
  return { categorias, opcoes, carregando, recarregar }
}

export function useMotivosPausa() {
  const [motivos, setMotivos] = useState<MotivoPausa[]>([])
  const [carregando, setCarregando] = useState(true)
  const recarregar = useCallback(async () => {
    const { data } = await supabase.from('motivos_pausa').select('id, nome, para_sla, ativo, ordem, comportamento, texto_cliente, exige_previsao').order('ordem').order('nome')
    setMotivos((data ?? []) as MotivoPausa[])
    setCarregando(false)
  }, [])
  useEffect(() => { recarregar() }, [recarregar])
  return { motivos, carregando, recarregar }
}

export function usePoliticasSla() {
  const [politicas, setPoliticas] = useState<PoliticaSla[]>([])
  const [carregando, setCarregando] = useState(true)
  const recarregar = useCallback(async () => {
    const { data } = await supabase.from('sla_politicas').select('id, nivel, client_id, categoria_id, horario_id, resposta_min, atendimento_min, solucao_min, ativo')
    setPoliticas((data ?? []) as PoliticaSla[])
    setCarregando(false)
  }, [])
  useEffect(() => { recarregar() }, [recarregar])
  return { politicas, carregando, recarregar }
}
