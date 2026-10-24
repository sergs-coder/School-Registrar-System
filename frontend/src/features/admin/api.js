import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/axios'

const params = (p) => ({ params: p, paramsSerializer: { indexes: null } })

export const adminKeys = {
  docTypes: ['admin', 'document-types'],
  settings: ['admin', 'settings'],
  holidays: ['admin', 'holidays'],
  announcements: ['admin', 'announcements'],
  users: (p) => ['admin', 'users', p],
  report: (p) => ['admin', 'report', p],
  audit: (p) => ['admin', 'audit', p],
  auditActions: ['admin', 'audit-actions'],
}

/** Mutation that refreshes the given query keys (and anything public that shows the same data). */
function useAdminMutation(fn, keys) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of keys) qc.invalidateQueries({ queryKey: key })
    },
  })
}

// ---------- document types ----------

export const useAdminDocumentTypes = () =>
  useQuery({ queryKey: adminKeys.docTypes, queryFn: async () => (await api.get('/admin/document-types')).data })

export const useSaveDocumentType = () =>
  useAdminMutation(
    async ({ id, body }) =>
      (id ? await api.put(`/admin/document-types/${id}`, body) : await api.post('/admin/document-types', body)).data,
    [adminKeys.docTypes, ['document-types']],
  )

// ---------- settings, holidays, announcements ----------

export const useAdminSettings = () =>
  useQuery({ queryKey: adminKeys.settings, queryFn: async () => (await api.get('/admin/settings')).data })

export const useSaveSettings = () =>
  useAdminMutation(async (body) => (await api.put('/admin/settings', body)).data, [adminKeys.settings, ['site-info']])

export const useHolidays = () =>
  useQuery({ queryKey: adminKeys.holidays, queryFn: async () => (await api.get('/admin/holidays')).data })

export const useAddHoliday = () =>
  useAdminMutation(async (body) => (await api.post('/admin/holidays', body)).data, [adminKeys.holidays])

export const useDeleteHoliday = () =>
  useAdminMutation(async (id) => api.delete(`/admin/holidays/${id}`), [adminKeys.holidays])

export const useAdminAnnouncements = () =>
  useQuery({ queryKey: adminKeys.announcements, queryFn: async () => (await api.get('/admin/announcements')).data })

export const useSaveAnnouncement = () =>
  useAdminMutation(
    async ({ id, body }) =>
      (id ? await api.put(`/admin/announcements/${id}`, body) : await api.post('/admin/announcements', body)).data,
    [adminKeys.announcements, ['announcements']],
  )

export const useDeleteAnnouncement = () =>
  useAdminMutation(async (id) => api.delete(`/admin/announcements/${id}`), [adminKeys.announcements, ['announcements']])

export const useRunReminders = () =>
  useAdminMutation(async () => (await api.post('/admin/reminders/run')).data, [['admin', 'audit']])

// ---------- users ----------

export const useUsers = (p) =>
  useQuery({
    queryKey: adminKeys.users(p),
    queryFn: async () => (await api.get('/admin/users', params(p))).data,
    placeholderData: keepPreviousData,
  })

const USERS = ['admin', 'users']
export const useCreateStaff = () => useAdminMutation(async (body) => (await api.post('/admin/users', body)).data, [USERS])
export const useUpdateUser = () =>
  useAdminMutation(async ({ id, body }) => (await api.patch(`/admin/users/${id}`, body)).data, [USERS])
export const useUnlockUser = () =>
  useAdminMutation(async (id) => (await api.post(`/admin/users/${id}/unlock`)).data, [USERS])
export const useSendPasswordLink = () =>
  useAdminMutation(async (id) => (await api.post(`/admin/users/${id}/send-password-link`)).data, [USERS])
/** Without `confirm` the API only previews the file; with it, it creates the accounts. */
export const useImportStudents = () =>
  useAdminMutation(async ({ file, confirm }) => {
    const form = new FormData()
    form.append('file', file)
    form.append('confirm', confirm ? 'true' : 'false')
    return (await api.post('/admin/students/import', form)).data
  }, [USERS])

// ---------- reports & audit ----------

export const useReport = (p) =>
  useQuery({
    queryKey: adminKeys.report(p),
    queryFn: async () => (await api.get('/admin/reports/summary', params(p))).data,
    placeholderData: keepPreviousData,
  })

export const useAuditLogs = (p) =>
  useQuery({
    queryKey: adminKeys.audit(p),
    queryFn: async () => (await api.get('/admin/audit-logs', params(p))).data,
    placeholderData: keepPreviousData,
  })

export const useAuditActions = () =>
  useQuery({
    queryKey: adminKeys.auditActions,
    queryFn: async () => (await api.get('/admin/audit-logs/actions')).data,
    staleTime: 5 * 60_000,
  })

/** CSV exports need the auth header, so fetch the file and hand it to the browser as a download. */
export async function downloadCsv(path, query, fallbackName) {
  const res = await api.get(path, { ...params(query), responseType: 'blob' }).catch(async (err) => {
    if (err.response?.data instanceof Blob) {
      try {
        err.response.data = JSON.parse(await err.response.data.text())
      } catch {
        // not JSON; keep the generic message
      }
    }
    throw err
  })
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(res.data)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
