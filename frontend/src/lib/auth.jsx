import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api, refreshSession, setAccessToken, setSessionLostHandler } from '@/lib/axios'

const AuthContext = createContext(null)

export function homePathFor(user) {
  if (!user) return '/login'
  return user.role === 'student' ? '/' : '/registrar'
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState({ status: 'loading', user: null })

  const clear = useCallback(() => {
    setAccessToken(null)
    queryClient.clear()
    setState({ status: 'anonymous', user: null })
  }, [queryClient])

  useEffect(() => {
    setSessionLostHandler(clear)
    refreshSession()
      .then((data) => setState({ status: 'authenticated', user: data.user }))
      .catch(() => setState({ status: 'anonymous', user: null }))
  }, [clear])

  const login = useCallback(async (identifier, password) => {
    const { data } = await api.post('/auth/login', { identifier, password })
    setAccessToken(data.access_token)
    setState({ status: 'authenticated', user: data.user })
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      clear()
    }
  }, [clear])

  const acceptConsent = useCallback(async () => {
    const { data } = await api.post('/auth/consent')
    setState({ status: 'authenticated', user: data })
    return data
  }, [])

  const setUser = useCallback((user) => setState((s) => ({ ...s, user })), [])

  const value = useMemo(
    () => ({ ...state, login, logout, acceptConsent, setUser }),
    [state, login, logout, acceptConsent, setUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
