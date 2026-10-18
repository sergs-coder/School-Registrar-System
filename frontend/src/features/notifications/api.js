import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { api } from '@/lib/axios'

export const notificationKeys = {
  count: ['notifications', 'count'],
  list: (params) => ['notifications', 'list', params],
}

/** Polls the unread count; when it goes up, request data is stale too, so refresh it. */
export function useUnreadCount() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: notificationKeys.count,
    queryFn: async () => (await api.get('/notifications/unread-count')).data.unread,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
  const prev = useRef(query.data)
  useEffect(() => {
    if (prev.current !== undefined && query.data > prev.current) {
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'list'] })
    }
    prev.current = query.data
  }, [query.data, qc])
  return query
}

export function useNotifications(params) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: async () => (await api.get('/notifications', { params })).data,
    placeholderData: keepPreviousData,
  })
}

function useNotificationMutation(fn) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      qc.setQueryData(notificationKeys.count, data.unread)
      qc.invalidateQueries({ queryKey: ['notifications', 'list'] })
    },
  })
}

export const useMarkRead = () =>
  useNotificationMutation(async (id) => (await api.post(`/notifications/${id}/read`)).data)

export const useMarkAllRead = () => useNotificationMutation(async () => (await api.post('/notifications/read-all')).data)
