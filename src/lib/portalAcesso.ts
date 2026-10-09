import { supabase } from '@/lib/supabase'

// Chamadas à função portal-acesso (convites, pedidos de acesso, anonimização) — migration 060

export interface ResultadoAcesso { ok: boolean; erro?: string; dados?: any }

export async function chamarAcesso(corpo: Record<string, unknown>): Promise<ResultadoAcesso> {
  const { data, error } = await supabase.functions.invoke('portal-acesso', { body: corpo })
  if (error) {
    let msg = 'Não foi possível concluir. Tente de novo.'
    try { const b = await (error as any).context?.json?.(); if (b?.erro) msg = b.erro } catch { /* mantém a mensagem padrão */ }
    return { ok: false, erro: msg }
  }
  if (data?.erro) return { ok: false, erro: data.erro }
  return { ok: true, dados: data }
}

export interface PessoaPortal { user_id: string; nome: string; email: string; celular: string | null; perfil: 'supervisor' | 'usuario'; ativo: boolean; desde: string; equipes: string[] }
export interface ConvitePortal { id: string; nome: string; email: string; perfil: 'supervisor' | 'usuario'; criado_em: string; expira_em: string; expirado: boolean }
export interface EquipePortal { id: string; nome: string; ativo: boolean; membros: string[]; unidades: string[] }
export interface SolicitacaoPortal { id: string; nome: string; email: string; celular: string | null; cliente_texto: string | null; mensagem: string | null; criado_em: string }
export interface GestaoCliente {
  papel: 'interno' | 'supervisor'
  portal_ativo: boolean
  pessoas: PessoaPortal[]
  convites: ConvitePortal[]
  equipes: EquipePortal[]
  unidades: { id: string; nome: string }[]
  solicitacoes: SolicitacaoPortal[]
}

export async function carregarGestao(clientId: string): Promise<{ gestao?: GestaoCliente; erro?: string }> {
  const { data, error } = await supabase.rpc('portal_listar_gestao', { p_client: clientId })
  if (error) return { erro: error.message }
  return { gestao: data as GestaoCliente }
}

export function baixarJson(nome: string, conteudo: unknown) {
  const blob = new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nome; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
