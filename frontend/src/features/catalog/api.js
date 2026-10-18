import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/axios'

export const catalogKeys = {
  all: ['document-types'],
  detail: (slug) => ['document-types', slug],
}

export function useDocumentTypes() {
  return useQuery({
    queryKey: catalogKeys.all,
    queryFn: async () => (await api.get('/document-types')).data,
    staleTime: 5 * 60_000,
  })
}

export function useDocumentType(slug) {
  return useQuery({
    queryKey: catalogKeys.detail(slug),
    queryFn: async () => (await api.get(`/document-types/${slug}`)).data,
    enabled: Boolean(slug),
    staleTime: 5 * 60_000,
  })
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: async () => (await api.get('/announcements/active')).data,
    staleTime: 5 * 60_000,
  })
}

export function useSiteInfo() {
  return useQuery({
    queryKey: ['site-info'],
    queryFn: async () => (await api.get('/site-info')).data,
    staleTime: 30 * 60_000,
  })
}

export const CATEGORY_LABELS = {
  record: 'Academic records',
  certificate: 'Certifications',
  form: 'Registrar forms',
}
