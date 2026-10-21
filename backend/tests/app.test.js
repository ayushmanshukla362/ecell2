import test from 'node:test'
import assert from 'node:assert/strict'
import { openStore } from '../store.js'
import { loadConfig } from '../config.js'
import { setup, password } from './helpers.js'

const event = { title: 'Founders Day', date: 'March 8, 2027', year: 2027, category: 'Workshop', type: 'session', featured: true, order: 0, image: 'https://example.com/event.jpg', descriptionSections: { about: 'A gathering of student founders.' } }
const member = { name: 'Student Founder', role: 'President', batch: '2027-2028', group: 'executives', featured: true, order: 0 }

test('configuration fails closed and production requires HTTPS and a real secret', () => {
  assert.throws(() => loadConfig({}), /AUTH_SECRET/)
  assert.throws(() => loadConfig({ AUTH_SECRET: 'x'.repeat(32), NODE_ENV: 'production' }), /HTTPS/)
  assert.throws(() => loadConfig({ AUTH_SECRET: 'x'.repeat(32), APP_ORIGIN: 'https://example.com/path' }), /origin/)
  assert.throws(() => loadConfig({ AUTH_SECRET: 'x'.repeat(32), ADMIN_EMAILS: 'not-an-email' }), /ADMIN_EMAILS/)
  assert.equal(loadConfig({ AUTH_SECRET: 'x'.repeat(32) }).adminEmails.size, 0)
  assert.equal(loadConfig({ AUTH_SECRET: 'x'.repeat(32), EMAIL_USER: 'sender@example.com', EMAIL_PASS: 'abcd efgh ijkl mnop', EMAIL_FROM: ' sender@example.com ' }).emailPass, 'abcdefghijklmnop')
})

test('email-only signup verifies email before accepting a password or creating a session', async (t) => {
  const f = await setup(t)
  const challenge = await f.signup('ADMIN@EXAMPLE.COM')
  assert.equal(challenge.status, 202)
  assert.equal(challenge.body.resendAfter, 60)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0)
  assert.equal((await f.request('/api/admin/content')).status, 401)
  const stored = f.db.prepare('SELECT * FROM challenges').get()
  assert.notEqual(stored.code_hash, f.outbox[0].code)
  assert.ok(!stored.payload.includes('password'))
  const proof = await f.verify(challenge)
  assert.equal(proof.status, 200)
  assert.equal(proof.body.verified, true)
  assert.equal(proof.body.purpose, 'signup')
  assert.equal(proof.body.email, 'admin@example.com')
  assert.equal(proof.body.user, undefined)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 0)
  assert.equal((await f.request('/api/admin/content', { cookie: proof.cookie })).status, 401)
  assert.match(proof.headers.get('set-cookie'), /HttpOnly/)
  assert.match(proof.headers.get('set-cookie'), /SameSite=Strict/)
  assert.equal((await f.verify(challenge)).status, 400)
  const signedIn = await f.complete(proof)
  assert.equal(signedIn.status, 200)
  assert.equal(signedIn.body.user.isAdmin, true)
  assert.equal(signedIn.body.user.hasPassword, true)
  assert.equal(signedIn.body.user.hasGoogle, false)
  assert.match(signedIn.headers.get('cache-control'), /no-store/)
  assert.equal((await f.request('/api/admin/content', { cookie: signedIn.cookie })).status, 200)
  assert.match(f.db.prepare('SELECT password_hash FROM users').get().password_hash, /^scrypt:/)
  assert.ok(!f.db.prepare('SELECT password_hash FROM users').get().password_hash.includes(password))
  assert.notEqual(f.db.prepare('SELECT token_hash FROM sessions').get().token_hash, signedIn.cookie.split('=')[1])
  assert.equal((await f.complete(proof)).status, 401)
})

test('returning users sign in with their password without any email dependency', async (t) => {
  const f = await setup(t)
  const previous = await f.account()
  const mailCount = f.outbox.length
  f.mailFail()
  assert.equal((await f.login('admin@example.com', 'incorrect')).status, 401)
  const signedIn = await f.login('admin@example.com', password, previous)
  assert.equal(signedIn.status, 200)
  assert.equal(signedIn.body.user.isAdmin, true)
  assert.notEqual(signedIn.cookie, previous.cookie)
  assert.notEqual(signedIn.body.csrfToken, previous.csrf)
  assert.equal(signedIn.body.challengeId, undefined)
  assert.equal(f.outbox.length, mailCount)
  assert.equal((await f.request('/api/admin/content', previous)).status, 401)
  assert.equal((await f.request('/api/admin/content', { cookie: signedIn.cookie })).status, 200)
})

test('password recovery verifies email first, revokes prior sessions, and keeps the new session', async (t) => {
  const f = await setup(t)
  const old = await f.account()
  const other = await f.login()
  f.tick(61000)
  const reset = await f.request('/api/auth/reset', { method: 'POST', body: { email: 'admin@example.com' } })
  assert.equal(reset.status, 202)
  const proof = await f.verify(reset)
  assert.equal(proof.body.purpose, 'reset')
  assert.equal((await f.request('/api/admin/content', old)).status, 200)
  const fresh = await f.complete(proof, { password: 'replacement long passphrase', name: 'Must not rename the account' })
  assert.equal(fresh.status, 200)
  assert.equal(fresh.body.user.name, old.user.name)
  assert.equal((await f.request('/api/admin/content', old)).status, 401)
  assert.equal((await f.request('/api/admin/content', { cookie: other.cookie })).status, 401)
  assert.equal((await f.request('/api/admin/content', { cookie: fresh.cookie })).status, 200)
  assert.equal((await f.login()).status, 401)
  assert.equal((await f.login('admin@example.com', 'replacement long passphrase')).status, 200)
})

test('non-admin cannot read or change any admin collection even with client-supplied roles', async (t) => {
  const f = await setup(t)
  const session = await f.account('student@example.com', { isAdmin: true, role: 'admin' })
  assert.equal(session.user.isAdmin, false)
  assert.equal((await f.request('/api/admin/content', session)).status, 403)
  for (const kind of ['events', 'members']) for (const method of ['POST', 'PUT', 'DELETE']) {
    assert.equal((await f.request(`/api/admin/${kind}${method === 'POST' ? '' : '/any-id'}`, { ...session, method, body: event })).status, 403)
    assert.equal((await f.request(`/api/admin/${kind}${method === 'POST' ? '' : '/any-id'}`, { method, body: event })).status, 401)
  }
  const admin = await f.account('admin@example.com')
  f.config.adminEmails.delete('admin@example.com')
  assert.equal((await f.request('/api/admin/content', admin)).status, 403)
})

test('origin, JSON content type and session-bound CSRF are enforced', async (t) => {
  const f = await setup(t)
  const admin = await f.account()
  assert.equal((await f.request('/api/admin/events', { ...admin, method: 'POST', body: event, origin: 'https://evil.example' })).status, 403)
  assert.equal((await f.request('/api/admin/events', { ...admin, method: 'POST', body: event, origin: null })).status, 403)
  assert.equal((await f.request('/api/admin/events', { cookie: admin.cookie, method: 'POST', body: event })).status, 403)
  assert.equal((await f.request('/api/admin/events', { ...admin, csrf: 'made-up', method: 'POST', body: event })).status, 403)
  assert.equal((await f.request('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'text/plain' } })).status, 415)
   const created = await f.request('/api/admin/events', { ...admin, method: 'POST', body: event })
   assert.equal(created.status, 201)
   assert.equal(created.body.item.type, 'session')
})

test('year/batch CRUD and homepage feature flags persist, with no reseeding deleted data', async (t) => {
  const f = await setup(t)
  const admin = await f.account()
  for (const [kind, data] of [['events', event], ['members', member]]) {
    const created = await f.request(`/api/admin/${kind}`, { ...admin, method: 'POST', body: data })
    assert.equal(created.status, 201)
    const id = created.body.item.id
    const updated = await f.request(`/api/admin/${kind}/${id}`, { ...admin, method: 'PUT', body: { ...data, featured: false, order: 5 } })
    assert.equal(updated.status, 200)
    let reopened = openStore(f.filename, f.seed)
    const stored = JSON.parse(reopened.prepare('SELECT data FROM content WHERE id = ?').get(id).data)
    assert.equal(stored.featured, false)
    reopened.close()
    const publicContent = await f.request('/api/content')
    assert.equal(publicContent.body[kind][0].featured, false)
    assert.equal(publicContent.body[kind][0].order, 5)
    assert.equal((await f.request(`/api/admin/${kind}/${id}`, { ...admin, method: 'DELETE' })).status, 204)
    assert.equal((await f.request(`/api/admin/${kind}/${id}`, { ...admin, method: 'PUT', body: data })).status, 404)
    reopened = openStore(f.filename, f.seed)
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM content WHERE kind = ?').get(kind).n, 0)
    reopened.close()
  }
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM audit_log').get().n, 6)
})

test('content rejects unsafe URLs, invalid batches, fields and duplicate event links', async (t) => {
  const f = await setup(t)
  const admin = await f.account()
  for (const patch of [{ image: 'javascript:alert(1)' }, { image: '//evil.example/image.jpg' }, { image: '/\\evil.example' }, { registrationUrl: 'http://insecure.example' }, { year: '2027' }, { type: 'webinar' }, { featured: 'true' }, { title: '' }, { order: -1 }, { descriptionSections: [] }, { speakers: 'not a list' }]) {
    assert.equal((await f.request('/api/admin/events', { ...admin, method: 'POST', body: { ...event, ...patch } })).status, 400, JSON.stringify(patch))
  }
  assert.equal((await f.request('/api/admin/events', { ...admin, method: 'POST', body: event })).status, 201)
  assert.equal((await f.request('/api/admin/events', { ...admin, method: 'POST', body: { ...event, title: event.title.toUpperCase() } })).status, 409)
  for (const patch of [{ batch: '2027-2029' }, { batch: 'invalid' }, { group: 'admin' }, { linkedin: 'javascript:alert(1)' }]) assert.equal((await f.request('/api/admin/members', { ...admin, method: 'POST', body: { ...member, ...patch } })).status, 400)
})

test('codes expire, lock after five wrong attempts and cannot be reused after replacement', async (t) => {
  const f = await setup(t)
  let challenge = await f.signup()
  const correct = f.outbox.at(-1).code
  for (let i = 0; i < 5; i++) assert.equal((await f.request('/api/auth/verify', { method: 'POST', body: { challengeId: challenge.body.challengeId, code: correct === '999999' ? '000000' : '999999' } })).status, 400)
  assert.equal((await f.verify(challenge)).status, 400)
  f.tick(61000)
  challenge = await f.signup()
  const old = challenge
  f.tick(61000)
  challenge = await f.signup()
  assert.equal((await f.verify(old)).status, 400)
  f.tick(10 * 60 * 1000 + 1)
  assert.equal((await f.verify(challenge)).status, 400)
})

test('mail failures leave no usable challenge, resend cooldown persists, mailbox syntax is bounded', async (t) => {
  const f = await setup(t)
  await f.signup()
  assert.equal((await f.signup()).status, 429)
  const reopened = openStore(f.filename, f.seed)
  assert.ok(reopened.prepare('SELECT count(*) AS n FROM rate_limits').get().n > 0)
  reopened.close()
  for (const email of ['person@example.com,attacker@example.com', 'a(comment)@example.com', 'a@example.com\nBcc:evil@example.com']) assert.equal((await f.signup(email)).status, 400)
  f.mailFail()
  const result = await f.signup('other@example.com')
  assert.equal(result.status, 503)
  assert.ok(!JSON.stringify(result.body).includes('SMTP'))
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM challenges WHERE email='other@example.com'").get().n, 0)
})

test('Google creates a session immediately with no local password or mail dependency', async (t) => {
  const f = await setup(t)
  f.mailFail()
  const result = await f.googleLogin({ email: 'admin@example.com', hd: 'example.com', sub: 'google-user-1' })
  assert.equal(result.status, 200)
  assert.equal(result.body.user.isAdmin, true)
  assert.equal(result.body.user.hasPassword, false)
  assert.equal(result.body.user.hasGoogle, true)
  assert.equal(result.body.challengeId, undefined)
  assert.equal(f.outbox.length, 0)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM challenges').get().n, 0)
  assert.equal((await f.request('/api/admin/content', { cookie: result.cookie })).status, 200)
  assert.equal(f.db.prepare('SELECT google_sub FROM users').get().google_sub, 'google-user-1')
})

test('logout and absolute expiry revoke access; production sets host-only Secure cookies', async (t) => {
  const f = await setup(t, { production: true, origin: 'https://ecell.example' })
  const proof = await f.verify(await f.signup())
  assert.match(proof.headers.get('set-cookie'), /__Host-ecell-setup=/)
  assert.match(proof.headers.get('set-cookie'), /Secure/)
  const signedIn = await f.complete(proof)
  const header = signedIn.setCookies.find((value) => value.startsWith('__Host-ecell-session='))
  assert.match(header, /HttpOnly/)
  assert.match(header, /Secure/)
  assert.match(header, /SameSite=Strict/)
  assert.ok(!header.includes('Domain='))
  const session = { cookie: signedIn.cookie, csrf: signedIn.body.csrfToken }
  assert.equal((await f.request('/api/auth/logout', { ...session, method: 'POST' })).status, 204)
  assert.equal((await f.request('/api/admin/content', session)).status, 401)
  const fresh = await f.login()
  f.tick(f.config.sessionMs + 1)
  assert.equal((await f.request('/api/admin/content', { cookie: fresh.cookie })).status, 401)
})

test('contact validates input, uses the backend mail adapter and limits abuse', async (t) => {
  const f = await setup(t)
  assert.equal((await f.request('/api/contact', { method: 'POST', body: { name: 'A', email: 'bad', message: '' } })).status, 400)
  const body = { name: 'A Student', email: 'student@example.com', message: 'I would like to discuss a new event.' }
  assert.equal((await f.request('/api/contact', { method: 'POST', body })).status, 200)
  assert.deepEqual(f.contact[0], body)
  for (let i = 0; i < 3; i++) await f.request('/api/contact', { method: 'POST', body })
  assert.equal((await f.request('/api/contact', { method: 'POST', body })).status, 429)
})
