import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'

export default function AppLayout() {
  useIdleTimeout(30)
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 md:ml-60 min-h-screen">
        <div className="p-4 md:p-6 pt-16 md:pt-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
