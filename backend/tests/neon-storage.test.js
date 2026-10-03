import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { setup } from './helpers.js'

class FakeObjectStorage {
  constructor() { this.objects = new Map() }
  async send(command) {
    const { Key } = command.input
    const name = command.constructor.name
    if (name === 'HeadObjectCommand') {
      const object = this.objects.get(Key)
      if (!object) throw Object.assign(new Error('not found'), { name: 'NotFound' })
      return { ContentLength: object.body.length, ContentType: object.type }
    }
    if (name === 'GetObjectCommand') {
      const object = this.objects.get(Key)
      if (!object) throw Object.assign(new Error('not found'), { name: 'NotFound' })
      return { Body: (async function * () { yield object.body })() }
    }
    if (name === 'PutObjectCommand') {
      this.objects.set(Key, { body: Buffer.from(command.input.Body), type: command.input.ContentType })
      return {}
    }
    if (name === 'DeleteObjectCommand') {
      this.objects.delete(Key)
      return {}
    }
    throw new Error(`Unexpected storage command ${name}`)
  }
}

const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#f6ca24' } }).png().toBuffer()

test('Neon Object Storage upload init/finalize validates bytes and keeps files outside Vercel payloads', async (t) => {
  const storage = new FakeObjectStorage()
  const f = await setup(t, {
    origin: 'https://ecell.example',
    mediaProvider: 'neon-object-storage',
    storage: { bucket: 'ecell-media', endpoint: 'https://storage.example', region: 'us-east-2', accessKeyId: 'test-key', secretAccessKey: 'test-secret' },
  }, { storageClient: storage, storageSign: async (_client, command) => `https://storage.example/${command.input.Key}?signed=1` })
  const owner = await f.account()
  const bytes = await png()
  const init = await f.request('/api/admin/uploads/init', { ...owner, method: 'POST', body: { name: 'yellow.png', type: 'image/png', size: bytes.length } })
  assert.equal(init.status, 201, JSON.stringify(init.body))
  assert.match(init.body.uploadUrl, /^https:\/\/storage\.example\/staging\//)
  assert.equal(init.body.headers['Content-Type'], 'image/png')
  storage.objects.set(`staging/${init.body.uploadId}`, { body: bytes, type: 'image/png' })
  const result = await f.request('/api/admin/uploads/finalize', { ...owner, method: 'POST', body: { uploadId: init.body.uploadId } })
  assert.equal(result.status, 201, JSON.stringify(result.body))
  assert.match(result.body.image.url, /^\/uploads\/[a-f0-9-]+\.webp$/)
  assert.equal(storage.objects.has(`staging/${init.body.uploadId}`), false)
  assert.equal(storage.objects.has(`uploads/${result.body.image.url.split('/').at(-1)}`), true)
  assert.equal((await f.request('/api/admin/uploads', owner)).body.uploadMode, 'neon-object-storage')
  const publicResponse = await fetch(`${f.base}${result.body.image.url}`, { redirect: 'manual' })
  assert.equal(publicResponse.status, 302)
  assert.match(publicResponse.headers.get('location'), /^https:\/\/storage\.example\/uploads\//)
})

test('Neon Object Storage rejects a staged object whose real format does not match its declared type', async (t) => {
  const storage = new FakeObjectStorage()
  const f = await setup(t, {
    origin: 'https://ecell.example',
    mediaProvider: 'neon-object-storage',
    storage: { bucket: 'ecell-media', endpoint: 'https://storage.example', region: 'us-east-2', accessKeyId: 'test-key', secretAccessKey: 'test-secret' },
  }, { storageClient: storage, storageSign: async (_client, command) => `https://storage.example/${command.input.Key}` })
  const owner = await f.account()
  const init = await f.request('/api/admin/uploads/init', { ...owner, method: 'POST', body: { type: 'image/png', size: 4 } })
  storage.objects.set(`staging/${init.body.uploadId}`, { body: Buffer.from('not-png'), type: 'image/png' })
  const result = await f.request('/api/admin/uploads/finalize', { ...owner, method: 'POST', body: { uploadId: init.body.uploadId } })
  assert.equal(result.status, 400)
  assert.equal(storage.objects.size, 0)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM uploads').get().n, 0)
})
