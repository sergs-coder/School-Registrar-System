import { createBrowserRouter } from 'react-router-dom'

import { AuthLayout } from '@/components/layout/AuthLayout'
import { RegistrarLayout } from '@/components/layout/RegistrarLayout'
import { StudentLayout } from '@/components/layout/StudentLayout'
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/components/RequireAuth'
import { ConsentPage } from '@/features/auth/pages/ConsentPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/pages/PasswordPages'
import { CatalogPage } from '@/features/catalog/pages/CatalogPage'
import { HomePage } from '@/features/home/pages/HomePage'
import { ProfilePage } from '@/features/profile/pages/ProfilePage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { DashboardPage } from '@/features/registrar/pages/DashboardPage'
import { QueuePage } from '@/features/registrar/pages/QueuePage'
import { MyRequestsPage } from '@/features/requests/pages/MyRequestsPage'
import { RequestDetailPage } from '@/features/requests/pages/RequestDetailPage'
import { EditRequestPage, NewRequestPage } from '@/features/requests/pages/RequestWizardPage'
import { NotFoundPage, PrivacyPage } from '@/pages/PublicPages'

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
        ],
      },
    ],
  },
  { path: '/consent', element: <ConsentPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
  {
    element: <RequireAuth roles={['student']} />,
    children: [
      {
        element: <StudentLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/requests', element: <MyRequestsPage /> },
          { path: '/requests/new', element: <CatalogPage /> },
          { path: '/requests/new/:slug', element: <NewRequestPage /> },
          { path: '/requests/:ref', element: <RequestDetailPage /> },
          { path: '/requests/:ref/edit', element: <EditRequestPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth roles={['staff', 'admin']} />,
    children: [
      {
        path: '/registrar',
        element: <RegistrarLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'requests', element: <QueuePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
