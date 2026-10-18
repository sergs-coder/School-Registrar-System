import axios from 'axios'

/**
 * API client. The access token lives only in memory; the refresh token is an httpOnly cookie
 * the browser sends to /api/v1/auth/*. Expired access tokens are refreshed once, transparently.
 */
export const api = axios.create({ baseURL: '/api/v1', withCredentials: true })

let accessToken = null
let refreshPromise = null
let onSessionLost = () => {}

export function setAccessToken(token) {
  accessToken = token
}

export function setSessionLostHandler(fn) {
  onSessionLost = fn
}

/** Single-flight: concurrent callers (and React StrictMode double effects) share one refresh. */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post('/api/v1/auth/refresh', null, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.access_token)
        return res.data
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error
    const code = response?.data?.error?.code
    if (response?.status === 401 && code === 'TOKEN_EXPIRED' && !config._retried) {
      config._retried = true
      try {
        await refreshSession()
        return api(config)
      } catch {
        setAccessToken(null)
        onSessionLost()
      }
    } else if (response?.status === 401 && ['INVALID_TOKEN', 'UNAUTHORIZED'].includes(code)) {
      setAccessToken(null)
      onSessionLost()
    }
    return Promise.reject(error)
  },
)
