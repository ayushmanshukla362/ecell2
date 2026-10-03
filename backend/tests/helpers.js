import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { openStore } from '../store.js'
import { createApp } from '../app.js'
import { loadConfig } from '../config.js'

export const password = 'a long unique test passphrase'

export async function setup(t, overrides = {}, appOptions = {}) {
  const folder = mkdtempSync(path.join(tmpdir(), 'ecell-test-'))
  const filename = path.join(folder, 'test.sqlite'), seed = path.join(folder, 'seed.json')
  writeFileSync(seed, JSON.stringify({ events: [], members: [] }))
  const db = openStore(filename, seed)
  const config = { ...loadConfig({ AUTH_SECRET: 'test-only-secret-that-is-at-least-32-characters', ADMIN_EMAILS: 'admin@example.com', GOOGLE_CLIENT_ID: 'test-google-client', UPLOAD_DIR: path.join(folder, 'uploads') }), ...overrides }
  let time = Date.now()
  const outbox = [], contact = []
  let mailFails = false, googleIdentity = null
  const app = createApp({ db, config, ...appOptions, now: () => time,
    sendCode: async (email, code, purpose) => { if (mailFails) throw new Error('SMTP internal detail'); outbox.push({ email, code, purpose }) },
    sendContact: async (data) => { contact.push(data) },
    verifyGoogle: async (credential) => { if (credential !== 'valid-provider-token' || !googleIdentity) throw new Error('Invalid Google token'); return googleIdentity },
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); db.close(); rmSync(folder, { recursive: true, force: true }) })
  async function request(url, { method = 'GET', body, cookie, csrf, origin = config.origin, headers = {} } = {}) {
    const response = await fetch(`${base}${url}`, { method, headers: { ...(origin ? { Origin: origin } : {}), ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers }, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) })
    const setCookies = response.headers.getSetCookie()
    const activeCookies = setCookies.map((value) => value.split(';')[0]).filter((value) => !value.endsWith('='))
    const responseCookie = activeCookies.find((value) => /ecell-session=/.test(value)) || activeCookies.find((value) => /ecell-setup=/.test(value)) || activeCookies[0]
    return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: responseCookie, setCookies, headers: response.headers }
  }
  const signup = (email = 'admin@example.com', extra = {}) => request('/api/auth/signup', { method: 'POST', body: { email, ...extra } })
  const verify = (challenge, options = {}) => request('/api/auth/verify', { method: 'POST', body: { challengeId: challenge.body.challengeId, code: outbox.at(-1)?.code }, ...options })
  const complete = (proof, body = {}, options = {}) => request('/api/auth/complete', { method: 'POST', cookie: proof.cookie, body: { name: 'Test Person', password, ...body }, ...options })
  const login = (email = 'admin@example.com', value = password, options = {}) => request('/api/auth/login', { method: 'POST', body: { email, password: value }, ...options })
  async function account(email, extra) {
    const proof = await verify(await signup(email, extra))
    assert.equal(proof.status, 200, JSON.stringify(proof.body))
    const result = await complete(proof, extra)
    assert.equal(result.status, 200, JSON.stringify(result.body))
    return { cookie: result.cookie, csrf: result.body.csrfToken, user: result.body.user }
  }
  async function googleLogin(identity, options = {}) {
    const start = await request('/api/auth/google/nonce', { method: 'POST', ...options })
    googleIdentity = { email_verified: true, name: 'Google Person', ...identity, nonce: start.body.nonce }
    return request('/api/auth/google', { method: 'POST', ...options, cookie: [start.cookie, options.cookie].filter(Boolean).join('; '), body: { credential: 'valid-provider-token' } })
  }
  return { db, config, request, signup, verify, complete, login, account, googleLogin, outbox, contact, filename, seed, base,
    tick: (ms) => { time += ms }, mailFail: () => { mailFails = true }, google: (identity) => { googleIdentity = identity } }
}
