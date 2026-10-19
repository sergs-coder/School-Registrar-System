import { createBrowserRouter } from 'react-router-dom'

import { AuthLayout } from '@/components/layout/AuthLayout'
import { RegistrarLayout } from '@/components/layout/RegistrarLayout'
import { StudentLayout } from '@/components/layout/StudentLayout'
import { FullPageLoader, RedirectIfAuthed, RequireAuth } from '@/features/auth/components/RequireAuth'

/**
 * Pages load on demand, so students never download the back office (and its charts), and only
 * admins load the admin pages. Only layouts and route guards are in the main bundle; even the sign-in
 * page (and its form libraries) loads separately, since signed-in users skip it.
 */
const page = (load, name) => async () => ({ Component: (await load())[name] })

const pages = {
  login: page(() => import('@/features/auth/pages/LoginPage'), 'LoginPage'),
  consent: page(() => import('@/features/auth/pages/ConsentPage'), 'ConsentPage'),
  forgot: page(() => import('@/features/auth/pages/PasswordPages'), 'ForgotPasswordPage'),
  reset: page(() => import('@/features/auth/pages/PasswordPages'), 'ResetPasswordPage'),
  privacy: page(() => import('@/pages/PublicPages'), 'PrivacyPage'),
  notFound: page(() => import('@/pages/PublicPages'), 'NotFoundPage'),
  verify: page(() => import('@/features/verify/VerifyPage'), 'VerifyPage'),
  verifyEmail: page(() => import('@/features/profile/pages/VerifyEmailPage'), 'VerifyEmailPage'),
  home: page(() => import('@/features/home/pages/HomePage'), 'HomePage'),
  myRequests: page(() => import('@/features/requests/pages/MyRequestsPage'), 'MyRequestsPage'),
  catalog: page(() => import('@/features/catalog/pages/CatalogPage'), 'CatalogPage'),
  newRequest: page(() => import('@/features/requests/pages/RequestWizardPage'), 'NewRequestPage'),
  editRequest: page(() => import('@/features/requests/pages/RequestWizardPage'), 'EditRequestPage'),
  requestDetail: page(() => import('@/features/requests/pages/RequestDetailPage'), 'RequestDetailPage'),
  notifications: page(() => import('@/features/notifications/NotificationsPage'), 'NotificationsPage'),
  profile: page(() => import('@/features/profile/pages/ProfilePage'), 'ProfilePage'),
  dashboard: page(() => import('@/features/registrar/pages/DashboardPage'), 'DashboardPage'),
  queue: page(() => import('@/features/registrar/pages/QueuePage'), 'QueuePage'),
  accountRequests: page(() => import('@/features/registrar/pages/AccountRequestsPage'), 'AccountRequestsPage'),
  alumniAccess: page(() => import('@/features/auth/pages/AlumniAccessPage'), 'AlumniAccessPage'),
  documentTypes: page(() => import('@/features/admin/pages/DocumentTypesPage'), 'DocumentTypesPage'),
  users: page(() => import('@/features/admin/pages/UsersPage'), 'UsersPage'),
  reports: page(() => import('@/features/admin/pages/ReportsPage'), 'ReportsPage'),
  auditLog: page(() => import('@/features/admin/pages/AuditLogPage'), 'AuditLogPage'),
  settings: page(() => import('@/features/admin/pages/SettingsPage'), 'SettingsPage'),
}

export const router = createBrowserRouter([
  {
    // Shown while the first page's code loads.
    HydrateFallback: FullPageLoader,
    children: [
      {
        element: <RedirectIfAuthed />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/login', lazy: pages.login },
              { path: '/forgot-password', lazy: pages.forgot },
              { path: '/reset-password', lazy: pages.reset },
              { path: '/alumni-access', lazy: pages.alumniAccess },
            ],
          },
        ],
      },
      { path: '/consent', lazy: pages.consent },
      { path: '/privacy', lazy: pages.privacy },
      { path: '/verify', lazy: pages.verify },
      { path: '/verify/:code', lazy: pages.verify },
      { path: '/verify-email', lazy: pages.verifyEmail },
      {
        element: <RequireAuth roles={['student']} />,
        children: [
          {
            element: <StudentLayout />,
            children: [
              { path: '/', lazy: pages.home },
              { path: '/requests', lazy: pages.myRequests },
              { path: '/requests/new', lazy: pages.catalog },
              { path: '/requests/new/:slug', lazy: pages.newRequest },
              { path: '/requests/:ref', lazy: pages.requestDetail },
              { path: '/requests/:ref/edit', lazy: pages.editRequest },
              { path: '/notifications', lazy: pages.notifications },
              { path: '/profile', lazy: pages.profile },
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
              { index: true, lazy: pages.dashboard },
              { path: 'requests', lazy: pages.queue },
              { path: 'account-requests', lazy: pages.accountRequests },
              {
                path: 'admin',
                element: <RequireAuth roles={['admin']} />,
                children: [
                  { path: 'document-types', lazy: pages.documentTypes },
                  { path: 'users', lazy: pages.users },
                  { path: 'reports', lazy: pages.reports },
                  { path: 'audit-log', lazy: pages.auditLog },
                  { path: 'settings', lazy: pages.settings },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', lazy: pages.notFound },
    ],
  },
])
