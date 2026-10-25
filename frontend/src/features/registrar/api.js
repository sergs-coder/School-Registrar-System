import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/axios'

export const staffKeys = {
  dashboard: ['staff', 'dashboard'],
  submissions: (granularity) => ['staff', 'dashboard', 'submissions', granularity],
  queue: (params) => ['staff', 'queue', params],
  detail: (ref) => ['staff', 'request', ref],
  members: ['staff', 'members'],
}

export function useDashboard() {
  return useQuery({
    queryKey: staffKeys.dashboard,
    queryFn: async () => (await api.get('/staff/dashboard')).data,
    refetchInterval: 60_000,
  })
}

/** Submissions per day / week / month / year; lives under the dashboard key so it refreshes with it. */
export function useSubmissionTrend(granularity) {
  return useQuery({
    queryKey: staffKeys.submissions(granularity),
    queryFn: async () => (await api.get('/staff/submissions', { params: { granularity } })).data,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
}

export function useQueue(params) {
  return useQuery({
    queryKey: staffKeys.queue(params),
    queryFn: async () => (await api.get('/staff/requests', { params, paramsSerializer: { indexes: null } })).data,
    placeholderData: keepPreviousData,
  })
}

export function useStaffRequest(ref) {
  return useQuery({
    queryKey: staffKeys.detail(ref),
    queryFn: async () => (await api.get(`/staff/requests/${ref}`)).data,
    enabled: Boolean(ref),
  })
}

export function useStaffMembers() {
  return useQuery({
    queryKey: staffKeys.members,
    queryFn: async () => (await api.get('/staff/members')).data,
    staleTime: 10 * 60_000,
  })
}

/** Every staff mutation returns the fresh detail; refresh queue + dashboard behind it. */
function useStaffMutation(fn) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      if (detail?.reference_no) qc.setQueryData(staffKeys.detail(detail.reference_no), detail)
      qc.invalidateQueries({ queryKey: ['staff', 'queue'] })
      qc.invalidateQueries({ queryKey: staffKeys.dashboard })
    },
  })
}

export const useTransition = (ref) =>
  useStaffMutation(async (body) => (await api.post(`/staff/requests/${ref}/transition`, body)).data)

export const useAddNote = (ref) =>
  useStaffMutation(async (remarks) => (await api.post(`/staff/requests/${ref}/notes`, { remarks })).data)

export const useAssign = (ref) =>
  useStaffMutation(async (staffId) => (await api.post(`/staff/requests/${ref}/assign`, { staff_id: staffId })).data)

export const useReviewAttachment = () =>
  useStaffMutation(async ({ id, review_status }) => (await api.patch(`/staff/attachments/${id}`, { review_status })).data)

export const useRejectPayment = (ref) =>
  useStaffMutation(
    async ({ paymentId, remarks, version }) =>
      (await api.post(`/staff/requests/${ref}/payments/${paymentId}/reject`, { remarks, version })).data,
  )

export const useUploadEDocument = (ref) =>
  useStaffMutation(async (file) => {
    const form = new FormData()
    form.append('file', file)
    return (await api.post(`/staff/requests/${ref}/e-document`, form)).data
  })

export const useRevokeEDocument = (ref) =>
  useStaffMutation(
    async ({ id, reason }) => (await api.post(`/staff/requests/${ref}/e-documents/${id}/revoke`, { reason })).data,
  )

export function useBulkTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body) => (await api.post('/staff/requests/bulk-transition', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

/** Pick-up appointments on one day (YYYY-MM-DD, Manila). */
export function usePickupsOn(date) {
  return useQuery({
    queryKey: ['staff', 'pickups', date],
    queryFn: async () => (await api.get('/staff/pickups', { params: { date } })).data,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
}

// ---------- access requests (new students, alumni, former students) ----------

export function useAccountRequests(status) {
  return useQuery({
    queryKey: ['staff', 'account-requests', status],
    queryFn: async () => (await api.get('/staff/account-requests', { params: { status } })).data,
    placeholderData: keepPreviousData,
  })
}

function useAccountRequestMutation(fn) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff', 'account-requests'] })
      qc.invalidateQueries({ queryKey: staffKeys.dashboard })
    },
  })
}

export const useApproveAccountRequest = () =>
  useAccountRequestMutation(async (id) => (await api.post(`/staff/account-requests/${id}/approve`)).data)

export const useRejectAccountRequest = () =>
  useAccountRequestMutation(
    async ({ id, remarks }) => (await api.post(`/staff/account-requests/${id}/reject`, { remarks })).data,
  )
