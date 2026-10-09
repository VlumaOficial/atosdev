// Grupos de atendimento (portal E2, migration 057) — rótulos e regras compartilhadas

export type NivelGrupo = 'n1' | 'n2' | 'n3' | 'campo'
export const NIVEIS_GRUPO: { value: NivelGrupo; label: string; descricao: string }[] = [
  { value: 'n1', label: 'N1', descricao: 'Triagem e primeiro atendimento' },
  { value: 'n2', label: 'N2', descricao: 'Especialistas' },
  { value: 'n3', label: 'N3', descricao: 'Especialistas avançados / fornecedor' },
  { value: 'campo', label: 'Campo', descricao: 'Atendimento presencial' },
]
export const ROTULO_NIVEL_GRUPO: Record<string, string> = Object.fromEntries(NIVEIS_GRUPO.map(n => [n.value, n.label]))

export const DIRECOES: Record<string, { rotulo: string; descricao: string }> = {
  escalonamento: { rotulo: 'Escalonamento', descricao: 'subiu de nível' },
  devolucao: { rotulo: 'Devolução', descricao: 'voltou para um nível anterior' },
  lateral: { rotulo: 'Lateral', descricao: 'mesmo nível' },
  encaminhamento: { rotulo: 'Encaminhamento', descricao: 'foi para um grupo' },
  reatribuicao: { rotulo: 'Reatribuição', descricao: 'mesmo grupo, outro técnico' },
}

// Tipos de OS em linguagem do cliente (a empresa edita os textos na E4; este é o padrão)
export const TIPOS_PORTAL: { value: string; rotulo: string }[] = [
  { value: 'incidente', rotulo: 'Relatar um problema' },
  { value: 'requisicao', rotulo: 'Fazer uma solicitação' },
  { value: 'visita', rotulo: 'Solicitar visita técnica' },
  { value: 'preventiva', rotulo: 'Agendar manutenção preventiva' },
]

// Perfis que fazem a triagem das OS (não são técnicos de campo)
export const PERFIS_EQUIPE_INTERNA = ['admin', 'gestor', 'atendente']
export function ehEquipeInterna(role?: string | null) { return !!role && PERFIS_EQUIPE_INTERNA.includes(role) }
