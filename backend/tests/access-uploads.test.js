import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { setup } from './helpers.js'
import { openStore } from '../store.js'
import { loadConfig } from '../config.js'

async function upload(f, session, bytes, type = 'image/png', extra = {}) {
  const response = await fetch(`${f.base}/api/admin/uploads`, { method: 'POST', headers: { Origin: f.config.origin, 'Content-Type': type, ...(session?.cookie ? { Cookie: session.cookie } : {}), ...(session?.csrf ? { 'X-CSRF-Token': session.csrf } : {}), ...extra }, body: bytes })
  return { status: response.status, body: await response.json() }
}
const png = () => sharp({ create: { width: 20, height: 30, channels: 3, background: '#f6ca24' } }).png().toBuffer()
const newEvent = (image = '') => ({ title: 'Uploaded event', year: 2030, date: 'March 8, 2030', image })

test('protected owners grant admins before signup; ordinary admins cannot manage access', async (t) => {
  const f = await setup(t)
  const owner = await f.account()
  assert.equal(owner.user.isOwner, true)
  assert.equal((await f.request('/api/admin/access')).status, 401)
  const granted = await f.request('/api/admin/access', { ...owner, method: 'POST', body: { email: 'NEW-ADMIN@example.com', isOwner: true } })
  assert.equal(granted.status, 201)
  assert.deepEqual(granted.body.admin, { email: 'new-admin@example.com', role: 'admin', source: 'database', joined: false, name: null })
  const admin = await f.account('new-admin@example.com')
  assert.equal(admin.user.isAdmin, true)
  assert.equal(admin.user.isOwner, false)
  assert.equal((await f.request('/api/admin/content', admin)).status, 200)
  for (const method of ['GET', 'POST', 'DELETE']) assert.equal((await f.request(`/api/admin/access${method === 'DELETE' ? '/admin%40example.com' : ''}`, { ...admin, method, body: { email: 'hijack@example.com' } })).status, 403)
  const list = await f.request('/api/admin/access', owner)
  assert.equal(list.body.admins.find((item) => item.email === 'new-admin@example.com').joined, true)
  assert.equal((await f.request('/api/admin/access', { ...owner, method: 'POST', body: { email: 'new-admin@example.com' } })).status, 409)
  assert.equal((await f.request('/api/admin/access', { ...owner, method: 'POST', body: { email: 'invalid' } })).status, 400)
  assert.equal((await f.request('/api/admin/access', { cookie: owner.cookie, method: 'POST', body: { email: 'new@example.com' } })).status, 403)
  const reopened = openStore(f.filename, f.seed)
  assert.equal(reopened.prepare('SELECT email FROM admin_grants').get().email, 'new-admin@example.com')
  reopened.close()
})

test('grant/revoke changes existing users immediately without deleting their accounts or content', async (t) => {
  const f = await setup(t)
  const owner = await f.account()
  const student = await f.account('student@example.com')
  assert.equal((await f.request('/api/admin/content', student)).status, 403)
  await f.request('/api/admin/access', { ...owner, method: 'POST', body: { email: student.user.email } })
  assert.equal((await f.request('/api/admin/content', student)).status, 200)
  assert.equal((await f.request('/api/auth/session', student)).body.user.isAdmin, true)
  const content = await f.request('/api/admin/events', { ...student, method: 'POST', body: newEvent() })
  assert.equal(content.status, 201)
  assert.equal((await f.request('/api/admin/access/student%40example.com', { ...owner, method: 'DELETE' })).status, 204)
  assert.equal((await f.request('/api/admin/content', student)).status, 401)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users WHERE email = ?').get(student.user.email).n, 1)
  assert.equal((await f.request('/api/content')).body.events.length, 1)
  const login = await f.login(student.user.email)
  assert.equal(login.body.user.isAdmin, false)
  assert.equal((await f.request('/api/admin/content', { cookie: login.cookie })).status, 403)
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM audit_log WHERE kind='admin-access'").get().n, 2)
})

test('owners cannot remove themselves or another environment owner', async (t) => {
  const f = await setup(t)
  f.config.adminEmails.add('other-owner@example.com')
  const owner = await f.account()
  for (const email of f.config.adminEmails) assert.equal((await f.request(`/api/admin/access/${encodeURIComponent(email)}`, { ...owner, method: 'DELETE' })).status, 409)
  assert.equal((await f.request('/api/admin/content', owner)).status, 200)
})

test('uploads require admin access, same-origin and session-bound CSRF before accepting file bytes', async (t) => {
  const f = await setup(t)
  const owner = await f.account(), student = await f.account('student@example.com'), bytes = await png()
  assert.equal((await upload(f, null, bytes)).status, 401)
  assert.equal((await upload(f, student, bytes)).status, 403)
  assert.equal((await upload(f, { cookie: owner.cookie }, bytes)).status, 403)
  assert.equal((await upload(f, owner, bytes, 'image/png', { Origin: 'https://evil.example' })).status, 403)
  assert.equal((await f.request('/api/admin/uploads', student)).status, 403)
  assert.deepEqual(readdirSync(f.config.uploadDir), [])
})

test('uploaded images are decoded, stripped of metadata, resized and re-encoded as public WebP', async (t) => {
  const f = await setup(t)
  const owner = await f.account()
  const original = await sharp({ create: { width: 3000, height: 100, channels: 3, background: '#f6ca24' } }).jpeg().withMetadata({ exif: { IFD0: { Artist: 'Private author metadata' } } }).toBuffer()
  const result = await upload(f, owner, original, 'image/jpeg')
  assert.equal(result.status, 201, JSON.stringify(result.body))
  const { image } = result.body
  assert.match(image.url, /^\/uploads\/[a-f0-9-]+\.webp$/)
  assert.equal(image.width, 2400)
  assert.equal(image.type, 'image/webp')
  const publicResponse = await fetch(`${f.base}${image.url}`)
  assert.equal(publicResponse.status, 200)
  assert.match(publicResponse.headers.get('content-type'), /image\/webp/)
  assert.equal(publicResponse.headers.get('x-content-type-options'), 'nosniff')
  const uploaded = Buffer.from(await publicResponse.arrayBuffer())
  assert.equal(uploaded.length, image.size)
  const metadata = await sharp(uploaded).metadata()
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.exif, undefined)
  assert.ok(!uploaded.includes(Buffer.from('Private author metadata')))
  const row = f.db.prepare('SELECT * FROM uploads').get()
  assert.deepEqual(readFileSync(path.join(f.config.uploadDir, row.filename)), uploaded)
  const reopened = openStore(f.filename, f.seed)
  assert.equal(reopened.prepare('SELECT id FROM uploads').get().id, image.id)
  reopened.close()
})

test('invalid, disguised, oversized and animated image files fail without persisting anything', async (t) => {
  const f = await setup(t)
  const owner = await f.account()
  assert.equal((await upload(f, owner, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml')).status, 415)
  assert.equal((await upload(f, owner, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/png')).status, 400)
  assert.equal((await upload(f, owner, Buffer.from('not an image'), 'image/png')).status, 400)
  assert.equal((await upload(f, owner, await png(), 'image/jpeg')).status, 400)
  assert.equal((await upload(f, owner, Buffer.alloc(0))).status, 400)
  assert.equal((await upload(f, owner, Buffer.alloc(8 * 1024 * 1024 + 1))).status, 413)
  // Two-frame animated WebP: animations are deliberately outside the supported image policy.
  const frames = Buffer.concat([Buffer.alloc(2 * 2 * 3, 40), Buffer.alloc(2 * 2 * 3, 220)])
  const animated = await sharp(frames, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer()
  const animationMeta = await sharp(animated).metadata()
  assert.equal(animationMeta.pages, 2)
  assert.equal((await upload(f, owner, animated, 'image/webp')).status, 400)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM uploads').get().n, 0)
  assert.deepEqual(readdirSync(f.config.uploadDir), [])
})

test('media deletion refuses referenced images, then deletes unreferenced files and metadata', async (t) => {
  const f = await setup(t, { origin: 'https://ecell.example' })
  const owner = await f.account()
  const result = await upload(f, owner, await png())
  const { image } = result.body
  const record = await f.request('/api/admin/events', { ...owner, method: 'POST', body: newEvent(image.url) })
  assert.equal(record.status, 201)
  const media = await f.request('/api/admin/uploads', owner)
  assert.equal(media.body.images[0].usedBy[0].id, record.body.item.id)
  assert.equal((await f.request(`/api/admin/uploads/${image.id}`, { ...owner, method: 'DELETE' })).status, 409)
  // An absolute same-origin gallery URL must also be recognized as a reference.
  assert.equal((await f.request(`/api/admin/events/${record.body.item.id}`, { ...owner, method: 'PUT', body: { ...newEvent(), images: [`${f.config.origin}${image.url}`] } })).status, 200)
  assert.equal((await f.request(`/api/admin/uploads/${image.id}`, { ...owner, method: 'DELETE' })).status, 409)
  // Restore a local query-bearing reference; content validation allows local image URLs.
  await f.request(`/api/admin/events/${record.body.item.id}`, { ...owner, method: 'PUT', body: newEvent(`${image.url}?size=large`) })
  assert.equal((await f.request(`/api/admin/uploads/${image.id}`, { ...owner, method: 'DELETE' })).status, 409)
  await f.request(`/api/admin/events/${record.body.item.id}`, { ...owner, method: 'DELETE' })
  assert.equal((await f.request(`/api/admin/uploads/${image.id}`, { ...owner, method: 'DELETE' })).status, 204)
  assert.equal((await fetch(`${f.base}${image.url}`)).status, 404)
  assert.equal(existsSync(path.join(f.config.uploadDir, image.url.split('/').at(-1))), false)
  assert.equal((await f.request('/api/admin/events', { ...owner, method: 'POST', body: newEvent(image.url) })).status, 400)
  assert.equal((await f.request(`/api/admin/uploads/${image.id}`, { ...owner, method: 'DELETE' })).status, 404)
})

test('storage quota and public upload routes cannot leak private files or accept arbitrary paths', async (t) => {
  const f = await setup(t, { uploadQuotaBytes: 1 })
  const owner = await f.account()
  assert.equal((await upload(f, owner, await png())).status, 409)
  assert.deepEqual(readdirSync(f.config.uploadDir), [])
  for (const url of ['/uploads/ecell.sqlite', '/uploads/.env', '/uploads/nested/file.webp', '/uploads/%2e%2e%2f.env']) assert.equal((await fetch(`${f.base}${url}`)).status, 404, url)
})

test('production configuration requires recovery email, protected owners and private storage locations', () => {
  const env = { NODE_ENV: 'production', APP_ORIGIN: 'https://ecell.example', AUTH_SECRET: 'x'.repeat(32), ADMIN_EMAILS: 'owner@example.com', EMAIL_USER: 'sender@gmail.com', EMAIL_PASS: 'placeholder-for-test-only' }
  assert.equal(loadConfig(env).uploadQuotaBytes, 1024 * 1024 * 1024)
  assert.throws(() => loadConfig({ ...env, ADMIN_EMAILS: '' }), /owner/)
  assert.throws(() => loadConfig({ ...env, EMAIL_PASS: '' }), /EMAIL_PASS/)
  assert.throws(() => loadConfig({ ...env, UPLOAD_DIR: 'public/uploads' }), /outside/)
  assert.throws(() => loadConfig({ ...env, DATABASE_PATH: 'dist/private.sqlite' }), /outside/)
  assert.throws(() => loadConfig({ ...env, UPLOAD_STORAGE_LIMIT_MB: '-1' }), /UPLOAD_STORAGE/)
})
