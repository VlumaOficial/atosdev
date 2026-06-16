import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import AtosLogo from '@/components/brand/AtosLogo'
import VlumaSignature from '@/components/brand/VlumaSignature'
import type { UserRole } from '@/types'
import {
  LayoutDashboard, ClipboardList, Users, Building2, MapPin,
  Settings, LogOut, Menu, X, ShieldCheck, Wrench, CheckSquare,
} from 'lucide-react'

interface NavItem {
  label: string
  to: string
  icon: React.ElementType
  roles: UserRole[]
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, roles: ['super_admin','admin','gestor','tecnico'] },
  { label: 'Ordens de Serviço', to: '/os', icon: ClipboardList, roles: ['super_admin','admin','gestor','tecnico'] },
  { label: 'Checklists', to: '/checklists', icon: CheckSquare, roles: ['super_admin','admin','gestor'] },
  { label: 'Técnicos', to: '/tecnicos', icon: Wrench, roles: ['super_admin','admin','gestor'] },
  { label: 'Clientes', to: '/clientes', icon: Building2, roles: ['super_admin','admin','gestor'] },
  { label: 'Unidades', to: '/locais', icon: MapPin, roles: ['super_admin','admin','gestor'] },
  { label: 'Usuários', to: '/usuarios', icon: Users, roles: ['super_admin','admin'] },
  { label: 'Tenants', to: '/tenants', icon: ShieldCheck, roles: ['super_admin'] },
  { label: 'Configurações', to: '/configuracoes', icon: Settings, roles: ['super_admin','admin'] },
]

function roleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    super_admin: 'Super Admin', admin: 'Administrador', gestor: 'Gestor', tecnico: 'Técnico',
  }
  return labels[role]
}

export default function Sidebar() {
  const { user, tenant, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!user) return null

  const visibleItems = navItems.filter(item => item.roles.includes(user.role))

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-border">
        <AtosLogo size={32} />
      </div>

      {user.role !== 'super_admin' && tenant && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Empresa</p>
          <p className="text-sm font-medium text-foreground truncate mt-0.5">{tenant.name}</p>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn('vluma-sidebar-item', isActive && 'active')}>
            <item.icon size={16} className="flex-shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary/50 mb-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-primary">{user.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
            <p className="text-[10px] text-muted-foreground">{roleLabel(user.role)}</p>
          </div>
        </div>
        <button onClick={handleSignOut}
          className="vluma-sidebar-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <LogOut size={16} />
          <span>Sair</span>
        </button>

        <VlumaSignature className="px-3 mt-3" />
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden md:flex flex-col w-60 h-screen bg-card border-r border-border fixed left-0 top-0 z-40">
        <SidebarContent />
      </aside>

      <button onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center text-foreground">
        <Menu size={18} />
      </button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full bg-card border-r border-border flex flex-col">
            <button onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
              <X size={14} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  )
}
