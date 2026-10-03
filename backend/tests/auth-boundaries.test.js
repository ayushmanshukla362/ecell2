import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanup, openStore } from '../store.js'
import { codeDigest } from '../security.js'
import { setup, password } from './helpers.js'

test('Google rejects forged credentials, unverified email, and missing, mismatched or expired nonces', async (t) => {
  const f = await setup(t)
  assert.equal((await f.request('/api/auth/google', { method: 'POST', body: { credential: 'forged' } })).status, 401)
  for (const scenario of ['missing-cookie', 'wrong-nonce', 'unverified', 'expired', 'missing-sub']) {
    const start = await f.request('/api/auth/google/nonce', { method: 'POST' })
    f.google({ nonce: scenario === 'wrong-nonce' ? 'wrong' : start.body.nonce, email: 'person@gmail.com', email_verified: scenario !== 'unverified', sub: scenario === 'missing-sub' ? '' : 'google-person' })
    if (scenario === 'expired') f.tick(f.config.codeMs + 1)
    const result = await f.request('/api/auth/google', { method: 'POST', cookie: scenario === 'missing-cookie' ? null : start.cookie, body: { credential: 'valid-provider-token' } })
    assert.equal(result.status, 401, scenario)
  }
  assert.equal(f.outbox.length, 0)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 0)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0)
})

test('Google accepts verified Gmail without hd, but rejects third-party email authority and string booleans', async (t) => {
  const f = await setup(t)
  const thirdParty = await f.googleLogin({ email: 'admin@example.com', sub: 'third-party-google-user' })
  assert.equal(thirdParty.status, 403)
  assert.equal((await f.googleLogin({ email: 'someone@gmail.com', sub: 'gmail-user', email_verified: 'true' })).status, 401)
  const gmail = await f.googleLogin({ email: 'someone@gmail.com', sub: 'gmail-user' })
  assert.equal(gmail.status, 200)
  assert.equal(gmail.body.user.isAdmin, false)
  assert.equal((await f.request('/api/admin/content', { cookie: gmail.cookie })).status, 403)
  assert.equal(f.outbox.length, 0)
})

test('Google nonce is single-use; repeating login reuses the account and rotates the session', async (t) => {
  const f = await setup(t)
  const start = await f.request('/api/auth/google/nonce', { method: 'POST' })
  f.google({ nonce: start.body.nonce, email: 'person@gmail.com', email_verified: true, sub: 'stable-google-id' })
  const request = { method: 'POST', cookie: start.cookie, body: { credential: 'valid-provider-token' } }
  const signedIn = await f.request('/api/auth/google', request)
  assert.equal(signedIn.status, 200)
  assert.equal((await f.request('/api/auth/google', request)).status, 401)
  const again = await f.googleLogin({ email: 'person@gmail.com', sub: 'stable-google-id' }, { cookie: signedIn.cookie, csrf: signedIn.body.csrfToken })
  assert.equal(again.status, 200)
  assert.equal(again.body.user.id, signedIn.body.user.id)
  assert.notEqual(again.cookie, signedIn.cookie)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 1)
  assert.equal((await f.request('/api/auth/session', { cookie: signedIn.cookie })).body.user, null)
})

test('trusted Google email links an existing verified local account without replacing its password or profile', async (t) => {
  const f = await setup(t)
  const local = await f.account()
  const original = f.db.prepare('SELECT * FROM users').get()
  const google = await f.googleLogin({ email: 'admin@example.com', hd: 'example.com', sub: 'workspace-user', name: 'Different Google Name' })
  assert.equal(google.status, 200)
  assert.equal(google.body.user.id, local.user.id)
  assert.equal(google.body.user.name, local.user.name)
  assert.equal(google.body.user.hasPassword, true)
  assert.equal(google.body.user.hasGoogle, true)
  assert.equal(f.db.prepare('SELECT password_hash FROM users').get().password_hash, original.password_hash)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 1)
  assert.equal((await f.login()).status, 200)
  assert.equal(f.outbox.length, 1)
})

test('Google cannot move a linked identity to a new email or replace another provider subject', async (t) => {
  const f = await setup(t)
  const first = await f.googleLogin({ email: 'admin@example.com', hd: 'example.com', sub: 'workspace-user' })
  assert.equal(first.status, 200)
  const changedEmail = await f.googleLogin({ email: 'different@example.com', hd: 'example.com', sub: 'workspace-user' })
  assert.equal(changedEmail.status, 409)
  const differentSubject = await f.googleLogin({ email: 'admin@example.com', hd: 'example.com', sub: 'another-workspace-user' })
  assert.equal(differentSubject.status, 409)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 1)
  assert.equal(f.db.prepare('SELECT google_sub FROM users').get().google_sub, 'workspace-user')
})

test('a signed-in Google-only user can verify email and create a local password without losing Google login', async (t) => {
  const f = await setup(t)
  const google = await f.googleLogin({ email: 'admin@example.com', hd: 'example.com', sub: 'workspace-user' })
  assert.equal(google.status, 200)
  assert.equal(f.db.prepare('SELECT password_hash FROM users').get().password_hash, null)
  assert.equal((await f.login()).status, 401)
  const session = { cookie: google.cookie, csrf: google.body.csrfToken }
  const reset = await f.request('/api/auth/reset', { ...session, method: 'POST', body: { email: 'admin@example.com' } })
  const proof = await f.verify(reset, session)
  assert.equal(proof.status, 200)
  const completed = await f.complete(proof, {}, { cookie: `${google.cookie}; ${proof.cookie}`, csrf: session.csrf })
  assert.equal(completed.status, 200)
  assert.equal(completed.body.user.id, google.body.user.id)
  assert.equal(completed.body.user.hasPassword, true)
  assert.equal(completed.body.user.hasGoogle, true)
  assert.equal((await f.request('/api/auth/session', session)).body.user, null)
  assert.equal((await f.login()).status, 200)
  assert.equal((await f.googleLogin({ email: 'admin@example.com', hd: 'example.com', sub: 'workspace-user' })).status, 200)
  assert.equal(f.outbox.length, 1)
})

test('password setup requires the verified cookie and ignores client email, purpose and role claims', async (t) => {
  const f = await setup(t)
  assert.equal((await f.request('/api/auth/complete', { method: 'POST', body: { email: 'admin@example.com', verified: true, password, name: 'An Admin' } })).status, 401)
  const proof = await f.verify(await f.signup('student@example.com'))
  assert.equal((await f.complete({ cookie: `ecell-setup=${'x'.repeat(43)}` })).status, 401)
  const result = await f.complete(proof, { email: 'admin@example.com', purpose: 'reset', role: 'admin', isAdmin: true })
  assert.equal(result.status, 200)
  assert.equal(result.body.user.email, 'student@example.com')
  assert.equal(result.body.user.isAdmin, false)
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM users WHERE email='admin@example.com'").get().n, 0)
})

test('setup proof is hashed, HttpOnly, expires, and never grants admin access before password completion', async (t) => {
  const f = await setup(t)
  const proof = await f.verify(await f.signup())
  const raw = proof.cookie.split('=')[1]
  assert.notEqual(f.db.prepare('SELECT token_hash FROM auth_grants').get().token_hash, raw)
  assert.match(proof.headers.get('set-cookie'), /HttpOnly/)
  assert.equal((await f.request('/api/admin/content', { cookie: proof.cookie })).status, 401)
  const reopened = openStore(f.filename, f.seed)
  assert.equal(reopened.prepare('SELECT count(*) AS n FROM auth_grants').get().n, 1)
  reopened.close()
  f.tick(f.config.codeMs + 1)
  assert.equal((await f.complete(proof)).status, 401)
  cleanup(f.db, Date.now() + 60 * 60 * 1000)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM auth_grants').get().n, 0)
})

test('concurrent password completion consumes a verified proof exactly once', async (t) => {
  const f = await setup(t)
  const proof = await f.verify(await f.signup())
  const results = await Promise.all([f.complete(proof), f.complete(proof)])
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 401])
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 1)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 1)
})

test('invalid new passwords do not consume the proof; unknown/duplicate account requests remain generic', async (t) => {
  const f = await setup(t)
  const start = await f.signup()
  const proof = await f.verify(start)
  assert.equal((await f.complete(proof, { password: 'short' })).status, 400)
  assert.equal((await f.complete(proof, { password: '🔑'.repeat(100) })).status, 400)
  assert.equal((await f.complete(proof)).status, 200)
  const duplicate = await f.signup()
  const unknown = await f.request('/api/auth/reset', { method: 'POST', body: { email: 'unknown@example.com' } })
  assert.equal(duplicate.status, 202)
  assert.equal(unknown.status, 202)
  assert.equal(duplicate.body.message, start.body.message)
  assert.equal(unknown.body.message, start.body.message)
  assert.equal((await f.verify(duplicate)).status, 400)
  assert.equal((await f.verify(unknown)).status, 400)
  assert.equal(f.outbox.length, 1)
})

test('a new password makes older recovery proofs unusable, including across browsers', async (t) => {
  const f = await setup(t)
  await f.account()
  const startReset = () => f.request('/api/auth/reset', { method: 'POST', body: { email: 'admin@example.com' } })
  f.tick(61000)
  const first = await f.verify(await startReset())
  f.tick(61000)
  const second = await f.verify(await startReset())
  assert.equal((await f.complete(second, { password: 'another long secure password' })).status, 200)
  assert.equal((await f.complete(first)).status, 401)
  assert.equal((await f.login()).status, 401)
  assert.equal((await f.login('admin@example.com', 'another long secure password')).status, 200)
})

test('legacy challenges cannot create sessions after the auth flow migration', async (t) => {
  const f = await setup(t)
  const code = '123456'
  for (const [index, purpose] of ['signup', 'reset', 'login', 'google'].entries()) {
    const id = String(index).repeat(43)
    f.db.prepare('INSERT INTO challenges(id,email,purpose,code_hash,payload,expires_at,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, 'admin@example.com', purpose, codeDigest(f.config.secret, id, code), JSON.stringify({ sub: 'old-subject', name: 'Legacy' }), Date.now() + 600000, Date.now())
    assert.equal((await f.request('/api/auth/verify', { method: 'POST', body: { challengeId: id, code } })).status, 400, purpose)
  }
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 0)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0)
})

test('password login is rate-limited even though it no longer sends email', async (t) => {
  const f = await setup(t)
  await f.account()
  for (let i = 0; i < 9; i++) assert.equal((await f.login('admin@example.com', 'incorrect')).status, 401)
  const blocked = await f.login()
  assert.equal(blocked.status, 429)
  assert.ok(Number(blocked.headers.get('retry-after')) > 0)
})

test('logout clears pending verification capabilities as well as the current session', async (t) => {
  const f = await setup(t)
  const proof = await f.verify(await f.signup())
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', cookie: proof.cookie })).status, 204)
  assert.equal((await f.complete(proof)).status, 401)
})
