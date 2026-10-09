import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import DashboardPage from '@/pages/DashboardPage'
import CalendariosPage from '@/pages/CalendariosPage'
import CatalogoSlaPage from '@/pages/CatalogoSlaPage'
import GruposPage from '@/pages/GruposPage'
import UsuariosPage from '@/pages/UsuariosPage'
import ClientsPage from '@/pages/ClientsPage'
import LocationsPage from '@/pages/LocationsPage'
import TechniciansPage from '@/pages/TechniciansPage'
import OrdersPage from '@/pages/OrdersPage'
import OrderDetailPage from '@/pages/OrderDetailPage'
import ChecklistsPage from '@/pages/ChecklistsPage'
import ChecklistEditorPage from '@/pages/ChecklistEditorPage'
import ChecklistAvulsosPage from '@/pages/ChecklistAvulsosPage'
import ConfiguracoesPage from '@/pages/ConfiguracoesPage'
import AvisoPrivacidadePage from '@/pages/AvisoPrivacidadePage'
import VerificarFotoPage from '@/pages/VerificarFotoPage'
import AtualizacaoApp from '@/components/AtualizacaoApp'
import MinhaAssinaturaPage from '@/pages/MinhaAssinaturaPage'
import TenantsPage from '@/pages/TenantsPage'
import FieldLayout from '@/components/layout/FieldLayout'
import MyOrdersPage from '@/pages/field/MyOrdersPage'
import FieldOrderPage from '@/pages/field/FieldOrderPage'
import MyChecklistsPage from '@/pages/field/MyChecklistsPage'
import FieldChecklistPage from '@/pages/field/FieldChecklistPage'
import PortalApp from '@/portal/PortalApp'
import { tipoDoHost, confirmarHostPortal } from '@/lib/portal'
import { useEffect, useState } from 'react'

// Placeholders para fases futuras
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="vluma-card p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
      <p className="text-muted-foreground text-sm mb-2">Em desenvolvimento</p>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  )
}

// Redireciona o técnico para o app de campo; demais veem o painel
function HomeRedirect() {
  const { user } = useAuth()
  if (user?.role === 'tecnico') return <Navigate to="/campo" replace />
  if (user?.role === 'atendente') return <Navigate to="/os?sit=em_aberto&gru=sem&tec=sem" replace />   // a fila de entrada é a tela inicial do atendimento
  return <DashboardPage />
}

export default function App() {
  // O ATOS (gestão e técnicos) nunca é confundido com um portal de cliente:
  // endereços do ATOS vão direto ao painel; "atendimento.*" é portal; qualquer
  // outro endereço (domínio próprio de uma empresa) é conferido no banco.
  const [tipo, setTipo] = useState(tipoDoHost())
  useEffect(() => {
    if (tipo !== 'desconhecido') return
    confirmarHostPortal().then(ehPortal => setTipo(ehPortal ? 'portal' : 'painel'))
      .catch(() => setTipo('painel'))
  }, [tipo])
  if (tipo === 'desconhecido') return <div className="min-h-screen" />
  if (tipo === 'portal') {
    return (
      <BrowserRouter>
        <AtualizacaoApp />
        <Routes>
          <Route path="/*" element={<PortalApp />} />
        </Routes>
      </BrowserRouter>
    )
  }
  return (
    <AuthProvider>
      <BrowserRouter>
        <AtualizacaoApp />
        <Routes>
          {/* Rota pública */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
          <Route path="/privacidade" element={<AvisoPrivacidadePage />} />
          <Route path="/verificar" element={<VerificarFotoPage />} />
          <Route path="/verificar/:codigo" element={<VerificarFotoPage />} />

          {/* Portal de atendimento pelo caminho interno (teste e contingência) */}
          <Route path="/portal/:slug/*" element={<PortalApp />} />

          {/* Rotas protegidas */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomeRedirect />} />

            {/* F3 — OS */}
            <Route path="os" element={<OrdersPage />} />
            <Route path="os/nova" element={<PlaceholderPage title="Nova OS" />} />
            <Route path="os/:id" element={<OrderDetailPage />} />
            <Route path="minha-assinatura" element={<MinhaAssinaturaPage />} />

            {/* F5 — Checklists */}
            <Route path="checklists" element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'gestor', 'tecnico']}><ChecklistsPage /></ProtectedRoute>} />
            <Route path="checklists/novo" element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'gestor', 'tecnico']}><ChecklistEditorPage /></ProtectedRoute>} />
            <Route
              path="checklists/avulsos"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'gestor']}>
                  <ChecklistAvulsosPage />
                </ProtectedRoute>
              }
            />
            <Route path="checklists/:id" element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'gestor', 'tecnico']}><ChecklistEditorPage /></ProtectedRoute>} />

            {/* F2 — Clientes e Locais */}
            <Route path="clientes" element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'gestor', 'tecnico']}><ClientsPage /></ProtectedRoute>} />
            <Route path="locais" element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'gestor', 'tecnico']}><LocationsPage /></ProtectedRoute>} />

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
                <ProtectedRoute allowedRoles={['admin']}>
                  <UsuariosPage />
                </ProtectedRoute>
              }
            />

            {/* Super Admin */}
            <Route
              path="tenants"
              element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <TenantsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="sla"
              element={
                <ProtectedRoute allowedRoles={['admin', 'gestor']}>
                  <CatalogoSlaPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="grupos"
              element={
                <ProtectedRoute allowedRoles={['admin', 'gestor']}>
                  <GruposPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="calendarios"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'gestor']}>
                  <CalendariosPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="configuracoes"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <ConfiguracoesPage />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* F4 — App de Campo (Técnico) — layout mobile dedicado */}
          <Route
            element={
              <ProtectedRoute>
                <FieldLayout />
              </ProtectedRoute>
            }
          >
            <Route path="campo" element={<MyOrdersPage />} />
            <Route path="campo/os/:id" element={<FieldOrderPage />} />
            <Route path="campo/checklists" element={<MyChecklistsPage />} />
            <Route path="campo/checklists/:id" element={<FieldChecklistPage />} />
            <Route path="campo/minha-assinatura" element={<MinhaAssinaturaPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
