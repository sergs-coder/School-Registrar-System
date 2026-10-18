import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/axios'

export const requestKeys = {
  all: ['requests'],
  list: (params) => ['requests', 'list', params],
  detail: (ref) => ['requests', 'detail', ref],
}

export function useMyRequests(params = {}) {
  return useQuery({
    queryKey: requestKeys.list(params),
    queryFn: async () =>
      (await api.get('/requests', { params, paramsSerializer: { indexes: null } })).data,
    placeholderData: keepPreviousData,
  })
}

export function useRequest(ref) {
  return useQuery({
    queryKey: requestKeys.detail(ref),
    queryFn: async () => (await api.get(`/requests/${ref}`)).data,
    enabled: Boolean(ref),
  })
}

export function useQuote(body, enabled = true) {
  return useQuery({
    queryKey: ['quote', body],
    queryFn: async () => (await api.post('/requests/quote', body)).data,
    enabled: enabled && Boolean(body?.document_type_id),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

/** All request mutations return the updated detail; keep the cache in sync. */
function useRequestMutation(fn) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      if (detail?.reference_no) qc.setQueryData(requestKeys.detail(detail.reference_no), detail)
      qc.invalidateQueries({ queryKey: ['requests', 'list'] })
    },
  })
}

export const useCreateDraft = () => useRequestMutation(async (body) => (await api.post('/requests', body)).data)

export const useUpdateRequest = (ref) =>
  useRequestMutation(async (body) => (await api.patch(`/requests/${ref}`, body)).data)

export const useSubmitRequest = (ref) =>
  useRequestMutation(async () => (await api.post(`/requests/${ref}/submit`)).data)

export const useResubmitRequest = (ref) =>
  useRequestMutation(async (remarks) => (await api.post(`/requests/${ref}/resubmit`, { remarks })).data)

export const useCancelRequest = (ref) =>
  useRequestMutation(async (remarks) => (await api.post(`/requests/${ref}/cancel`, { remarks })).data)

export const useUploadAttachment = (ref) =>
  useRequestMutation(async ({ requirementKey, file }) => {
    const form = new FormData()
    form.append('requirement_key', requirementKey)
    form.append('file', file)
    return (await api.post(`/requests/${ref}/attachments`, form)).data
  })

export const useDeleteAttachment = (ref) =>
  useRequestMutation(async (id) => (await api.delete(`/requests/${ref}/attachments/${id}`)).data)

export function useDeleteDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ref) => api.delete(`/requests/${ref}`),
    onSuccess: (_, ref) => {
      qc.removeQueries({ queryKey: requestKeys.detail(ref) })
      qc.invalidateQueries({ queryKey: ['requests', 'list'] })
    },
  })
}

/** Files need the auth header, so fetch as a blob and open it in a new tab. */
export async function openAttachment(id) {
  const win = window.open('', '_blank')
  try {
    const res = await api.get(`/attachments/${id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    if (win) win.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    win?.close()
    throw err
  }
}
