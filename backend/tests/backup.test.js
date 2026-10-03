import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { setup } from './helpers.js'
import { openStore } from '../store.js'

test('maintenance backup captures a restorable SQLite snapshot plus referenced upload files', async (t) => {
  const f = await setup(t)
  const owner = await f.account()
  await f.request('/api/admin/access', { ...owner, method: 'POST', body: { email: 'future-admin@example.com' } })
  const bytes = await sharp({ create: { width: 5, height: 5, channels: 3, background: 'yellow' } }).png().toBuffer()
  const response = await fetch(`${f.base}/api/admin/uploads`, { method: 'POST', headers: { Origin: f.config.origin, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf, 'Content-Type': 'image/png' }, body: bytes })
  assert.equal(response.status, 201)
  const { image } = await response.json()
  await f.request('/api/admin/events', { ...owner, method: 'POST', body: { title: 'Backup event', year: 2030, date: 'March 2030', image: image.url } })
  const targetRoot = path.join(path.dirname(f.filename), 'backups')
  const env = { ...process.env, ENV_FILE: path.join(path.dirname(f.filename), 'no-private-env'), NODE_ENV: 'development', APP_ORIGIN: f.config.origin, AUTH_SECRET: f.config.secret, DATABASE_PATH: f.filename, UPLOAD_DIR: f.config.uploadDir, ADMIN_EMAILS: 'admin@example.com', EMAIL_USER: '', EMAIL_PASS: '' }
  assert.throws(() => execFileSync(process.execPath, ['scripts/backup.mjs'], { env, stdio: 'pipe' }))
  execFileSync(process.execPath, ['scripts/backup.mjs', '--maintenance-confirmed', '--output', targetRoot], { env, stdio: 'pipe', timeout: 20000 })
  const entries = readdirSync(targetRoot)
  assert.equal(entries.length, 1)
  const snapshot = path.join(targetRoot, entries[0])
  const manifest = JSON.parse(readFileSync(path.join(snapshot, 'manifest.json'), 'utf8'))
  assert.equal(manifest.counts.users, 1)
  assert.equal(manifest.counts.uploads, 1)
  assert.equal(manifest.counts.admin_grants, 1)
  const restored = openStore(path.join(snapshot, 'ecell.sqlite'), f.seed)
  try {
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    assert.equal(restored.prepare('SELECT email FROM admin_grants').get().email, 'future-admin@example.com')
    const saved = JSON.parse(restored.prepare("SELECT data FROM content WHERE kind='events'").get().data)
    assert.equal(saved.title, 'Backup event')
    assert.equal(saved.image, image.url)
    const file = image.url.split('/').at(-1)
    assert.deepEqual(readFileSync(path.join(snapshot, 'uploads', file)), readFileSync(path.join(f.config.uploadDir, file)))
  } finally { restored.close() }
})
