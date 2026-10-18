/** Helpers for the API's {"error": {code, message, details}} envelope. */

export function apiError(err) {
  const e = err?.response?.data?.error
  if (e) return e
  if (err?.response) return { code: 'HTTP_ERROR', message: 'Something went wrong. Please try again.', details: [] }
  return { code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check your connection and try again.', details: [] }
}

export function errorMessage(err) {
  return apiError(err).message
}

/** Pushes field-level server errors into react-hook-form. Returns true if any were applied. */
export function applyFieldErrors(err, setError, fieldMap = {}) {
  const { details = [] } = apiError(err)
  let applied = false
  for (const d of details) {
    if (!d.field) continue
    const name = fieldMap[d.field] ?? d.field
    setError(name, { type: 'server', message: d.message })
    applied = true
  }
  return applied
}
