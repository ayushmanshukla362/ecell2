import test from 'node:test'
import assert from 'node:assert/strict'

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

test('a slow session refresh cannot overwrite the CSRF token returned by a successful sign-in', async (t) => {
  const { api } = await import(`../../src/lib/api.js?test=login-race`)
  let sessionReads = 0, releaseRefresh, resolveRefreshStarted
  const refreshStarted = new Promise((resolve) => { resolveRefreshStarted = resolve })
  const writes = []
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    if (path === '/api/auth/session') {
      sessionReads += 1
      if (sessionReads === 1) return json({ user: null, csrfToken: null })
      resolveRefreshStarted()
      return new Promise((resolve) => { releaseRefresh = resolve })
    }
    if (path === '/api/auth/login') return json({ user: { id: 'signed-in' }, csrfToken: 'new-session-csrf' })
    writes.push(options.headers['X-CSRF-Token'])
    return json({ ok: true })
  })
  await api('/api/auth/session')
  const refresh = api('/api/auth/session')
  await refreshStarted
  await api('/api/auth/login', { method: 'POST', body: { email: 'test@example.com', password: 'fixture-not-a-real-password' } })
  releaseRefresh(json({ user: null, csrfToken: null }))
  await refresh
  await api('/api/admin/events', { method: 'POST', body: {} })
  assert.deepEqual(writes, ['new-session-csrf'])
})

test('a pre-logout session refresh cannot restore an old CSRF token after logout', async (t) => {
  const { api } = await import(`../../src/lib/api.js?test=logout-race`)
  let sessionReads = 0, releaseRefresh, resolveRefreshStarted
  const refreshStarted = new Promise((resolve) => { resolveRefreshStarted = resolve })
  const writes = []
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    if (path === '/api/auth/session') {
      sessionReads += 1
      if (sessionReads === 1) return json({ user: { id: 'existing' }, csrfToken: 'old-session-csrf' })
      resolveRefreshStarted()
      return new Promise((resolve) => { releaseRefresh = resolve })
    }
    if (path === '/api/auth/logout') return new Response(null, { status: 204 })
    writes.push(options.headers['X-CSRF-Token'])
    return json({ ok: true })
  })
  await api('/api/auth/session')
  const refresh = api('/api/auth/session')
  await refreshStarted
  await api('/api/auth/logout', { method: 'POST' })
  releaseRefresh(json({ user: { id: 'existing' }, csrfToken: 'old-session-csrf' }))
  await refresh
  await api('/api/auth/signup', { method: 'POST', body: { email: 'test@example.com' } })
  assert.deepEqual(writes, [undefined])
})
