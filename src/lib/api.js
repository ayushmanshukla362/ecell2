let csrfToken
let csrfRevision = 0
let sessionRequest

async function request(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const response = await fetch(path, { ...options, credentials: 'same-origin', signal: controller.signal, headers: { ...options.headers, Accept: 'application/json' } })
    if (response.status === 204) return null
    const data = await response.json().catch(() => null)
    if (!response.ok) throw Object.assign(new Error(data?.message || 'The request failed. Please try again.'), { status: response.status })
    if (!data) throw new Error('The API is unavailable. Please try again later.')
    return data
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request took too long. Please try again.')
    if (error instanceof TypeError) throw new Error('Cannot connect to the server. Check your connection and try again.')
    throw error
  } finally { clearTimeout(timer) }
}

export async function api(path, { method = 'GET', body, cache } = {}) {
  if (!path.startsWith('/api/')) throw new Error('API paths must be same-origin /api/ URLs.')
  const mutation = !['GET', 'HEAD'].includes(method)
  const binary = body instanceof Blob
  if (mutation && csrfToken === undefined) {
    const revision = csrfRevision
    sessionRequest ||= request('/api/auth/session').finally(() => { sessionRequest = null })
    const session = await sessionRequest
    if (revision === csrfRevision) csrfToken = session.csrfToken
  }
  const revision = csrfRevision
  try {
    const result = await request(path, {
      method,
      headers: mutation ? { 'Content-Type': binary ? body.type : 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) } : {},
      ...(cache ? { cache } : {}),
      ...(mutation ? { body: binary ? body : JSON.stringify(body ?? {}) } : {}),
    })
    if (result && Object.hasOwn(result, 'csrfToken') && (mutation || revision === csrfRevision)) {
      csrfToken = result.csrfToken
      if (mutation) csrfRevision += 1
    }
    if (path === '/api/auth/logout') { csrfToken = null; csrfRevision += 1 }
    return result
  } catch (error) {
    if (error.status === 401 && revision === csrfRevision) {
      csrfRevision += 1
      csrfToken = undefined
      window.dispatchEvent(new Event('ecell:session-expired'))
    }
    throw error
  }
}
