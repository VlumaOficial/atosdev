// ============================================================
// ATOS — Tipos globais
// ============================================================

export type UserRole = 'super_admin' | 'admin' | 'gestor' | 'tecnico'

export type TenantStatus = 'active' | 'suspended' | 'trial'

export type OSStatus = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada'

export type OSPriority = 'baixa' | 'normal' | 'alta' | 'urgente'

export type ServiceType =
  | 'cftv'
  | 'rede'
  | 'controle_acesso'
  | 'eletrica'
  | 'preventiva'
  | 'outro'

// ---- Tenant (empresa cliente) --------------------------------
export interface Tenant {
  id: string
  name: string
  cnpj?: string
  email?: string
  phone?: string
  status: TenantStatus
  plan: 'starter' | 'professional' | 'enterprise'
  created_at: string
  updated_at: string
}

// ---- Usuário do sistema (painel web) -------------------------
export interface AppUser {
  id: string
  tenant_id: string | null   // null = Super Admin VLUMA
  name: string
  email: string
  role: UserRole
  avatar_url?: string
  active: boolean
  created_at: string
}

// ---- Cliente (empresa atendida pela Infoxtec) ----------------
export interface Client {
  id: string
  tenant_id: string
  name: string
  cnpj?: string
  email?: string
  phone?: string
  address?: string
  created_at: string
}

// ---- Local / Unidade do cliente ------------------------------
export interface Location {
  id: string
  tenant_id: string
  client_id: string
  name: string          // ex: "Loja 01 — Shopping Iguatemi"
  address?: string
  city?: string
  state?: string
  created_at: string
}

// ---- Ordem de Serviço ----------------------------------------
export interface ServiceOrder {
  id: string
  tenant_id: string
  client_id: string
  location_id?: string
  technician_id?: string   // user com role=tecnico
  created_by: string       // user (gestor/admin) que abriu
  title: string
  description?: string
  service_type: ServiceType
  priority: OSPriority
  status: OSStatus
  scheduled_at?: string
  started_at?: string
  finished_at?: string
  signature_url?: string   // PNG da assinatura no Supabase Storage
  signer_name?: string
  pdf_url?: string
  created_at: string
  updated_at: string
}

// ---- Item de Checklist (template) ----------------------------
export interface ChecklistTemplate {
  id: string
  tenant_id: string
  service_type: ServiceType
  name: string             // ex: "Checklist CFTV — Preventiva"
  items: ChecklistItem[]
  created_at: string
}

export interface ChecklistItem {
  id: string
  order: number
  label: string
  type: 'boolean' | 'text' | 'photo' | 'number'
  required: boolean
}

// ---- Resposta de Checklist (por OS) --------------------------
export interface ChecklistResponse {
  id: string
  os_id: string
  checklist_template_id: string
  responses: Record<string, unknown>  // { item_id: value }
  filled_by: string
  filled_at: string
}

// ---- Auth context --------------------------------------------
export interface AuthContextType {
  user: AppUser | null
  tenant: Tenant | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}
