import { useAuth } from '@/hooks/useAuth'
import { ClipboardList, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'

const stats = [
  { label: 'OS Abertas', value: '—', icon: ClipboardList, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { label: 'Em Andamento', value: '—', icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { label: 'Concluídas Hoje', value: '—', icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10' },
  { label: 'Urgentes', value: '—', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
]

export default function DashboardPage() {
  const { user, tenant } = useAuth()

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">
          Olá, {user?.name.split(' ')[0]} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {tenant ? tenant.name : 'VLUMA Tecnologia — Super Admin'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(stat => (
          <div key={stat.label} className="vluma-card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                <stat.icon size={18} className={stat.color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Placeholder */}
      <div className="vluma-card p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
        <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <ClipboardList size={24} className="text-primary" />
        </div>
        <h2 className="text-base font-semibold mb-2">Dashboard em construção</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          Os indicadores de OS, mapa de técnicos e atividade recente serão adicionados nas próximas fases.
        </p>
      </div>
    </div>
  )
}
