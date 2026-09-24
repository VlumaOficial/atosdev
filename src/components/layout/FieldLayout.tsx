import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'
import { cn } from '@/lib/utils'
import { LogOut, ClipboardList, ClipboardCheck, PenTool } from 'lucide-react'
import AtribuicaoMapas from '@/components/AtribuicaoMapas'

const TABS = [
  { to: '/campo', label: 'Atendimentos', icon: ClipboardList },
  { to: '/campo/checklists', label: 'Checklists', icon: ClipboardCheck },
]

export default function FieldLayout() {
  const { user, signOut } = useAuth()
  useIdleTimeout(30)

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">ATOS</span>
            <span className="text-xs text-muted-foreground">Campo</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/campo/minha-assinatura" title="Minha assinatura"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <PenTool size={14} /> <span className="hidden sm:inline">{user?.name}</span>
            </Link>
            <button onClick={signOut} title="Sair" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav className="max-w-lg mx-auto px-4 flex items-center gap-1 border-t border-border">
          {TABS.map(tab => (
            <NavLink key={tab.to} to={tab.to} end
              className={({ isActive }) => cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition',
                isActive ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'
              )}>
              <tab.icon size={15} />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="px-4 py-5">
        <Outlet />
        <div className="max-w-lg mx-auto text-center pt-6">
          <Link to="/privacidade" target="_blank" className="text-xs text-muted-foreground hover:text-foreground transition">
            Aviso de privacidade
          </Link>
          <AtribuicaoMapas className="mt-1" />
        </div>
      </main>
    </div>
  )
}
