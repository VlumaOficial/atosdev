import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'
import { useAuth } from '@/hooks/useAuth'
import { varrerOrfaosSeDevido } from '@/lib/armazenamento'

export default function AppLayout() {
  useIdleTimeout(30)
  const { user } = useAuth()

  // rede de segurança contra fotos órfãs no bucket (no máx. 1x a cada 12h)
  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'super_admin') varrerOrfaosSeDevido()
  }, [user?.role])
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 md:ml-60 min-h-screen">
        <div className="p-4 md:p-6 pt-16 md:pt-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
