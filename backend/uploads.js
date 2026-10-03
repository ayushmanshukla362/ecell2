import express from 'express'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, unlinkSync, existsSync, openSync, closeSync, renameSync } from 'node:fs'
import path from 'node:path'
import { accessFor } from './access.js'
import { httpError, rateLimit } from './security.js'

export const MAX_FILE_BYTES = 8 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }
const filePattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/

export const isUploadRequest = (req) => req.method === 'POST' && /^\/api\/admin\/uploads\/?(?:\?.*)?$/.test(req.originalUrl)
const imageUrls = (item) => [item.image, item.listingImage, ...(item.images || [])].filter(Boolean)
function localUploadPath(value, origin) {
  try {
    const url = new URL(value, origin)
    return url.origin === origin && url.pathname.startsWith('/uploads/') ? url.pathname : null
  } catch { return null }
}
export function assertUploadsExist(db, config, item) {
  for (const value of imageUrls(item)) {
    const local = localUploadPath(value, config.origin)
    if (local && !db.prepare('SELECT 1 FROM uploads WHERE filename = ?').get(local.slice('/uploads/'.length))) throw httpError(400, 'An uploaded image no longer exists. Choose another image or upload it again.')
  }
}
function references(db, config, filename) {
  const url = `/uploads/${filename}`
  return db.prepare('SELECT kind,id,data FROM content').all().flatMap((row) => {
    const item = JSON.parse(row.data)
    return imageUrls(item).some((value) => localUploadPath(value, config.origin) === url) ? [{ kind: row.kind, id: row.id, title: item.title || item.name }] : []
  })
}
const imageView = (row, usedBy = []) => ({ id: row.id, url: `/uploads/${row.filename}`, name: row.name, type: 'image/webp', size: row.size, width: row.width, height: row.height, createdAt: row.created_at, usedBy })

export function installUploads(app, { db, config, now = Date.now }) {
  mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 })
  let activeUploads = 0
  let activeDecoders = 0
  const audit = (req, action, id) => db.prepare('INSERT INTO audit_log(actor_id,action,kind,item_id,created_at) VALUES(?,?,?,?,?)').run(req.user.id, action, 'upload', id, now())
  app.get('/api/admin/uploads', (req, res) => {
    const images = db.prepare('SELECT * FROM uploads ORDER BY created_at DESC,id').all().map((row) => imageView(row, references(db, config, row.filename)))
    res.json({ images, maxFileBytes: MAX_FILE_BYTES, allowedTypes: IMAGE_TYPES, uploadMode: 'local' })
  })
  app.post('/api/admin/uploads/init', (req, res) => {
    rateLimit(db, `uploads-init:${req.user.id}`, 60, 10 * 60 * 1000, now())
    res.json({ mode: 'local', maxFileBytes: MAX_FILE_BYTES, allowedTypes: IMAGE_TYPES })
  })
  app.post('/api/admin/uploads', (req, res, next) => {
    rateLimit(db, `uploads:${req.user.id}`, 60, 10 * 60 * 1000, now())
    if (activeUploads >= 2) throw httpError(429, 'Other images are being processed. Please retry in a moment.')
    if (Number(req.get('Content-Length')) > MAX_FILE_BYTES) throw httpError(413, 'Each image must be 8 MiB or smaller.')
    activeUploads++
    let released = false
    const release = () => { if (!released) { released = true; activeUploads-- } }
    res.once('finish', release)
    res.once('close', release)
    next()
  }, express.raw({ type: IMAGE_TYPES, limit: MAX_FILE_BYTES, inflate: false }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(400, 'Select a JPEG, PNG, or WebP image to upload.')
    const contentType = req.get('Content-Type').split(';')[0].trim().toLowerCase()
    if (res.destroyed) return
    if (activeDecoders >= 2) throw httpError(429, 'Other images are being processed. Please retry in a moment.')
    activeDecoders++
    let output
    try {
      const image = sharp(req.body, { limitInputPixels: 25000000, failOn: 'warning' })
      const metadata = await image.metadata()
      if (metadata.format !== formats[contentType] || !['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1 || metadata.width > 12000 || metadata.height > 12000) throw new Error('Unsupported image')
      // Decode and re-encode pixels, remove metadata/embedded payloads, normalize orientation.
      output = await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true })
    } catch { throw httpError(400, 'Invalid or unsupported image. Use a non-animated JPEG, PNG, or WebP up to 25 megapixels.') }
    finally { activeDecoders-- }
    if (res.destroyed) return
    if (output.data.length > MAX_FILE_BYTES) throw httpError(413, 'The processed image is too large. Please choose a smaller image.')
    const id = randomUUID(), filename = `${id}.webp`
    const destination = path.join(config.uploadDir, filename)
    let written = false
    db.exec('BEGIN IMMEDIATE')
    try {
      // Decoding is async: recheck authorization so revocation during processing wins.
      if (!accessFor(db, config, req.user.email).isAdmin || !db.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?').get(req.session.token_hash, now())) throw httpError(403, 'Your administrator access changed. Please sign in again.')
      const used = db.prepare('SELECT COALESCE(SUM(size),0) AS size FROM uploads').get().size
      if (used + output.data.length > config.uploadQuotaBytes) throw httpError(409, 'Upload storage is full. Remove unused images or ask the owner to increase the storage limit.')
      const file = openSync(destination, 'wx', 0o600)
      written = true
      try { writeFileSync(file, output.data) } finally { closeSync(file) }
      db.prepare('INSERT INTO uploads(id,filename,name,size,width,height,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(id, filename, `Image ${id.slice(0, 8)}`, output.data.length, output.info.width, output.info.height, req.user.id, now())
      audit(req, 'create', id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      if (written) unlinkSync(destination)
      throw error
    }
    res.status(201).json({ image: imageView(db.prepare('SELECT * FROM uploads WHERE id = ?').get(id)) })
  })
  app.delete('/api/admin/uploads/:id', (req, res) => {
    rateLimit(db, `uploads-delete:${req.user.id}`, 60, 60 * 1000, now())
    const image = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id)
    if (!image) throw httpError(404, 'This image no longer exists.')
    const location = path.join(config.uploadDir, image.filename)
    const tombstone = path.join(config.uploadDir, `.${image.id}.deleting`)
    let moved = false
    db.exec('BEGIN IMMEDIATE')
    try {
      if (references(db, config, image.filename).length) throw httpError(409, 'This image is still used by an event or team member. Remove those references before deleting it.')
      if (existsSync(location)) { renameSync(location, tombstone); moved = true }
      db.prepare('DELETE FROM uploads WHERE id = ?').run(image.id)
      audit(req, 'delete', image.id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      if (moved) renameSync(tombstone, location)
      throw error
    }
    if (moved) unlinkSync(tombstone)
    res.status(204).end()
  })
  // Serve only recorded re-encoded images, never an arbitrary directory/file path.
  app.get('/uploads/:filename', (req, res, next) => {
    if (!filePattern.test(req.params.filename) || !db.prepare('SELECT 1 FROM uploads WHERE filename = ?').get(req.params.filename)) return res.status(404).end()
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' })
    res.sendFile(req.params.filename, { root: config.uploadDir, dotfiles: 'deny' }, (error) => { if (error) next(error.status === 404 ? httpError(404, 'Image not found.') : error) })
  })
  app.use('/uploads', (req, res) => res.status(404).end())
}
