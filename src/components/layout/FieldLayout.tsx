import { Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'
import { LogOut } from 'lucide-react'

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
            <span className="text-xs text-muted-foreground hidden sm:inline">{user?.name}</span>
            <button onClick={signOut} title="Sair" className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="px-4 py-5">
        <Outlet />
      </main>
    </div>
  )
}
