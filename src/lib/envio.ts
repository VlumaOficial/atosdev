import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/types'

// Envio do relatório (Blocos D + E, 2026-09-24). Níveis por empresa
// (plano): basico = WhatsApp pelo aparelho + e-mail "via ATOS";
// intermediario = + e-mail próprio; avancado = + WhatsApp automático
// (Evolution/oficial — a refinar com o usuário na VPS dele).

export type NivelEnvio = 'basico' | 'intermediario' | 'avancado'
export interface ConfigEnvio {
  whatsapp_ativo: boolean
  email_ativo: boolean
  mensagem: string
  permissao: 'todos' | 'selecionados' | 'ninguem'
  tecnicos_permitidos: string[]
  smtp_ativo: boolean
  smtp_host: string | null
  smtp_porta: number
  smtp_usuario: string | null
  smtp_remetente_nome: string | null
  smtp_email_remetente: string | null
}

export const NIVEL_ROTULO: Record<NivelEnvio, string> = {
  basico: 'Básico — WhatsApp pelo aparelho + e-mail "via ATOS"',
  intermediario: 'Intermediário — + e-mail próprio da empresa',
  avancado: 'Avançado — + WhatsApp automático (em preparação)',
}

export function useConfigEnvio(tenantId?: string | null) {
  const [config, setConfig] = useState<ConfigEnvio | null>(null)
  const carregar = useCallback(async () => {
    if (!tenantId) return
    const { data } = await supabase.from('tenant_envio_config').select('*').eq('tenant_id', tenantId).maybeSingle()
    setConfig((data as ConfigEnvio) ?? null)
  }, [tenantId])
  useEffect(() => { carregar() }, [carregar])
  return { config, recarregar: carregar }
}

// Bloco E: técnico conforme a configuração; admin/gestor sempre
export function podeEnviar(user: AppUser | null, cfg: ConfigEnvio | null): boolean {
  if (!user || !cfg) return false
  if (user.role !== 'tecnico') return true
  if (cfg.permissao === 'todos') return true
  if (cfg.permissao === 'selecionados') return cfg.tecnicos_permitidos.includes(user.id)
  return false
}

export function montarMensagem(modelo: string, v: { os: string; empresa: string; cliente: string; link: string }) {
  return modelo.split('{os}').join(v.os).split('{empresa}').join(v.empresa).split('{cliente}').join(v.cliente).split('{link}').join(v.link)
}

export function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
export function telefoneValido(v: string) { const d = v.replace(/\D/g, ''); return d.length === 10 || d.length === 11 }
// LGPD: na linha do tempo só o destino mascarado
export function mascararTelefoneLgpd(v: string) { const d = v.replace(/\D/g, ''); return `(${d.slice(0, 2)}) ${d.slice(2, 3)}****-${d.slice(-4)}` }

// WhatsApp do APARELHO: abre o app com a mensagem pronta (sem API, sem conta)
export function linkWhatsApp(telefone: string, mensagem: string) {
  return `https://wa.me/55${telefone.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`
}
