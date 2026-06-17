import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import DashboardPage from '@/pages/DashboardPage'
import ClientsPage from '@/pages/ClientsPage'
import LocationsPage from '@/pages/LocationsPage'
import TechniciansPage from '@/pages/TechniciansPage'

// Placeholders para fases futuras
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="vluma-card p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
      <p className="text-muted-foreground text-sm mb-2">Em desenvolvimento</p>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Rota pública */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

          {/* Rotas protegidas */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />

            {/* F3 — OS */}
            <Route path="os" element={<PlaceholderPage title="Ordens de Serviço" />} />
            <Route path="os/nova" element={<PlaceholderPage title="Nova OS" />} />
            <Route path="os/:id" element={<PlaceholderPage title="Detalhes da OS" />} />

            {/* F4 — App de Campo (Técnico) */}
            <Route path="campo" element={<PlaceholderPage title="App de Campo" />} />

            {/* F5 — Checklists */}
            <Route path="checklists" element={<PlaceholderPage title="Checklists" />} />

            {/* F2 — Clientes e Locais */}
            <Route path="clientes" element={<ClientsPage />} />
            <Route path="locais" element={<LocationsPage />} />

            {/* F1 — Usuários e Técnicos */}
            <Route
              path="tecnicos"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'gestor']}>
                  <TechniciansPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="usuarios"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <PlaceholderPage title="Usuários" />
                </ProtectedRoute>
              }
            />

            {/* Super Admin */}
            <Route
              path="tenants"
              element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <PlaceholderPage title="Tenants — Super Admin" />
                </ProtectedRoute>
              }
            />

            <Route path="configuracoes" element={<PlaceholderPage title="Configurações" />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
