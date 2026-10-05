import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { assertAdminSession } from './access.js'
import { httpError, rateLimit } from './security.js'
import { IMAGE_TYPES, MAX_FILE_BYTES } from './uploads.js'

const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }
const uuidPattern = /^[a-f0-9-]{36}$/
const filePattern = /^[a-f0-9-]{36}\.webp$/
const imageUrls = (item) => [item.image, item.listingImage, ...(item.images || [])].filter(Boolean)

function imageKey(filename) { return `uploads/${filename}` }
function stagingKey(id) { return `staging/${id}` }
function localUploadPath(value, origin) {
  try {
    const url = new URL(value, origin)
    return url.origin === origin && url.pathname.startsWith('/uploads/') ? url.pathname : null
  } catch { return null }
}

function imageView(row, usedBy = []) {
  return { id: row.id, url: `/uploads/${row.filename}`, name: row.name, type: 'image/webp', size: Number(row.size), width: row.width, height: row.height, createdAt: Number(row.created_at), usedBy }
}

async function references(db, config, filename) {
  const url = `/uploads/${filename}`
  const rows = await db.prepare('SELECT kind,id,data FROM content').all()
  return rows.flatMap((row) => {
    const item = JSON.parse(row.data)
    return imageUrls(item).some((value) => localUploadPath(value, config.origin) === url) ? [{ kind: row.kind, id: row.id, title: item.title || item.name }] : []
  })
}

export async function assertObjectUploadsExist(db, config, item) {
  for (const value of imageUrls(item)) {
    const local = localUploadPath(value, config.origin)
    if (local && !await db.prepare('SELECT 1 FROM uploads WHERE filename = ?').get(local.slice('/uploads/'.length))) throw httpError(400, 'An uploaded image no longer exists. Choose another image or upload it again.')
  }
}

function assertStorageConfig(config) {
  if (!config.storage?.bucket || !config.storage?.endpoint || !config.storage?.region || !config.storage?.accessKeyId || !config.storage?.secretAccessKey) throw new Error('Neon Object Storage requires AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and NEON_STORAGE_BUCKET.')
}

async function bodyBuffer(body, limit) {
  if (!body) throw new Error('Object storage returned no body.')
  const chunks = []
  let total = 0
  for await (const chunk of body) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += value.length
    if (total > limit) throw httpError(413, 'The uploaded image is too large.')
    chunks.push(value)
  }
  return Buffer.concat(chunks, total)
}

async function decodeImage(input, contentType) {
  try {
    const image = sharp(input, { limitInputPixels: 25000000, failOn: 'warning' })
    const metadata = await image.metadata()
    if (metadata.format !== formats[contentType] || !['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1 || metadata.width > 12000 || metadata.height > 12000) throw new Error('Unsupported image')
    return await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true })
  } catch (error) {
    if (error.status) throw error
    throw httpError(400, 'Invalid or unsupported image. Use a non-animated JPEG, PNG, or WebP up to 25 megapixels.')
  }
}

function makeClient(config) {
  assertStorageConfig(config)
  return new S3Client({
    region: config.storage.region,
    endpoint: config.storage.endpoint,
    forcePathStyle: true,
    // Presigned browser PUTs do not have a body when they are signed. Newer
    // AWS SDK versions can otherwise add a checksum for that empty body to the
    // URL, which Neon correctly rejects when the browser sends the image.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: config.storage.accessKeyId, secretAccessKey: config.storage.secretAccessKey },
  })
}

export function installNeonUploads(app, { db, config, now = Date.now, s3: suppliedClient, sign = getSignedUrl }) {
  const s3 = suppliedClient || makeClient(config)
  const audit = (req, action, id) => db.prepare('INSERT INTO audit_log(actor_id,action,kind,item_id,created_at) VALUES(?,?,?,?,?)').run(req.user.id, action, 'upload', id, now())
  const command = (type, input) => type === 'put'
    ? new PutObjectCommand({ Bucket: config.storage.bucket, ...input })
    : type === 'get' ? new GetObjectCommand({ Bucket: config.storage.bucket, ...input })
      : type === 'head' ? new HeadObjectCommand({ Bucket: config.storage.bucket, ...input })
        : new DeleteObjectCommand({ Bucket: config.storage.bucket, ...input })
  const signed = (input, expiresIn = 300) => sign(s3, new PutObjectCommand({ Bucket: config.storage.bucket, ...input }), { expiresIn })

  app.get('/api/admin/uploads', async (req, res) => {
    const rows = await db.prepare('SELECT * FROM uploads ORDER BY created_at DESC,id').all()
    const images = await Promise.all(rows.map(async (row) => imageView(row, await references(db, config, row.filename))))
    res.json({ images, maxFileBytes: MAX_FILE_BYTES, allowedTypes: IMAGE_TYPES, uploadMode: 'neon-object-storage' })
  })

  app.post('/api/admin/uploads/init', async (req, res) => {
    await rateLimit(db, `uploads-init:${req.user.id}`, 60, 10 * 60 * 1000, now())
    const type = typeof req.body.type === 'string' ? req.body.type.toLowerCase() : ''
    const size = Number(req.body.size)
    if (!IMAGE_TYPES.includes(type) || !Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES) throw httpError(400, 'Select a JPEG, PNG, or WebP image up to 8 MiB.')
    const id = randomUUID()
    const key = stagingKey(id)
    await db.transaction(async () => {
      await assertAdminSession(db, config, req, now())
      await db.prepare('INSERT INTO upload_intents(id,object_key,user_id,content_type,size,expires_at,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(id, key, req.user.id, type, size, now() + 15 * 60 * 1000, now())
    })
    const uploadUrl = await signed({ Key: key, ContentType: type })
    res.status(201).json({ mode: 'neon-object-storage', uploadId: id, uploadUrl, headers: { 'Content-Type': type }, expiresIn: 300, maxFileBytes: MAX_FILE_BYTES })
  })

  app.post('/api/admin/uploads/finalize', async (req, res) => {
    await rateLimit(db, `uploads-finalize:${req.user.id}`, 60, 10 * 60 * 1000, now())
    const id = req.body.uploadId
    if (typeof id !== 'string' || !uuidPattern.test(id)) throw httpError(400, 'This upload is invalid or expired. Choose the image again.')
    const intent = await db.prepare('SELECT * FROM upload_intents WHERE id = ? AND user_id = ? AND expires_at > ?').get(id, req.user.id, now())
    if (!intent) throw httpError(400, 'This upload is invalid or expired. Choose the image again.')
    let finalKey
    try {
      const head = await s3.send(command('head', { Key: intent.object_key }))
      if (!Number.isSafeInteger(Number(head.ContentLength)) || Number(head.ContentLength) < 1 || Number(head.ContentLength) > MAX_FILE_BYTES) throw httpError(413, 'The uploaded image is too large.')
      const source = await s3.send(command('get', { Key: intent.object_key }))
      const input = await bodyBuffer(source.Body, MAX_FILE_BYTES)
      const output = await decodeImage(input, intent.content_type)
      if (output.data.length > MAX_FILE_BYTES) throw httpError(413, 'The processed image is too large. Please choose a smaller image.')
      const imageId = randomUUID()
      const filename = `${imageId}.webp`
      finalKey = imageKey(filename)
      await s3.send(command('put', { Key: finalKey, Body: output.data, ContentType: 'image/webp', CacheControl: 'public,max-age=31536000,immutable' }))
      await db.transaction(async () => {
        const current = await db.prepare('SELECT * FROM upload_intents WHERE id = ? AND user_id = ? AND expires_at > ?').get(id, req.user.id, now())
        if (!current) throw httpError(403, 'This upload is invalid or expired. Please start again.')
        await assertAdminSession(db, config, req, now())
        const used = await db.prepare('SELECT COALESCE(SUM(size),0) AS size FROM uploads').get()
        if (Number(used.size) + output.data.length > config.uploadQuotaBytes) throw httpError(409, 'Upload storage is full. Remove unused images or ask the owner to increase the storage limit.')
        await db.prepare('INSERT INTO uploads(id,filename,name,size,width,height,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(imageId, filename, `Image ${imageId.slice(0, 8)}`, output.data.length, output.info.width, output.info.height, req.user.id, now())
        await audit(req, 'create', imageId)
        await db.prepare('DELETE FROM upload_intents WHERE id = ?').run(id)
      })
      res.status(201).json({ image: imageView({ id: imageId, filename, name: `Image ${imageId.slice(0, 8)}`, size: output.data.length, width: output.info.width, height: output.info.height, created_at: now() }) })
    } catch (error) {
      if (finalKey) await s3.send(command('delete', { Key: finalKey })).catch(() => {})
      throw error
    } finally {
      await s3.send(command('delete', { Key: intent.object_key })).catch(() => {})
      // Invalid or abandoned staging objects should not remain usable after an attempt.
      await db.prepare('DELETE FROM upload_intents WHERE id = ?').run(id).catch(() => {})
    }
  })

  app.delete('/api/admin/uploads/:id', async (req, res) => {
    await rateLimit(db, `uploads-delete:${req.user.id}`, 60, 60 * 1000, now())
    const image = await db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id)
    if (!image) throw httpError(404, 'This image no longer exists.')
    if (await references(db, config, image.filename).then((value) => value.length)) throw httpError(409, 'This image is still used by an event or team member. Remove those references before deleting it.')
    await db.transaction(async () => {
      await assertAdminSession(db, config, req, now())
      const current = await db.prepare('SELECT * FROM uploads WHERE id = ?').get(image.id)
      if (!current) throw httpError(404, 'This image no longer exists.')
      if (await references(db, config, current.filename).then((value) => value.length)) throw httpError(409, 'This image is still used by an event or team member. Remove those references before deleting it.')
      await db.prepare('DELETE FROM uploads WHERE id = ?').run(image.id)
      await audit(req, 'delete', image.id)
    })
    await s3.send(command('delete', { Key: imageKey(image.filename) })).catch(() => {})
    res.status(204).end()
  })

  app.get('/uploads/:filename', async (req, res, next) => {
    try {
      if (!filePattern.test(req.params.filename) || !await db.prepare('SELECT 1 FROM uploads WHERE filename = ?').get(req.params.filename)) return res.status(404).end()
      const url = await sign(s3, new GetObjectCommand({ Bucket: config.storage.bucket, Key: imageKey(req.params.filename), ResponseContentType: 'image/webp', ResponseContentDisposition: 'inline' }), { expiresIn: 300 })
      res.redirect(302, url)
    } catch (error) { next(error) }
  })
  app.use('/uploads', (req, res) => res.status(404).end())
}

// Keep this export useful for configuration/tests without constructing a client.
export { imageKey, stagingKey }
