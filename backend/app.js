import express from 'express'
import compression from 'compression'
import helmet from 'helmet'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { asStore } from './database.js'
import { installAuth } from './auth.js'
import { installAccess, assertAdminSession } from './access.js'
import { getAdminContent, installUsers } from './users.js'
import { installUploads, isUploadRequest, IMAGE_TYPES, assertUploadsExist } from './uploads.js'
import { installNeonUploads, assertObjectUploadsExist } from './neon-storage.js'
import { eventSlug, getContent } from './store.js'
import { validateContent } from './validation.js'
import { emailValue, nameValue, httpError, rateLimit } from './security.js'

export function createApp({ db, config, sendCode, sendContact, verifyGoogle, now = Date.now, distPath, storageClient, storageSign }) {
  // Raw SQLite is accepted for existing tests and local callers. All HTTP
  // handlers use the normalized async interface, while the legacy local media
  // adapter continues to receive its synchronous SQLite connection.
  const store = asStore(db)
  const localDb = store.dialect === 'sqlite' ? store.raw : null
  const useLocalMedia = Boolean(localDb && (config.mediaProvider || 'local') === 'local')
  const useNeonMedia = config.mediaProvider === 'neon-object-storage'
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.proxyHops)
  app.use(compression({ threshold: 1024 }))
  app.use(helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://accounts.google.com/gsi/', ...(config.storage?.endpoint ? [new URL(config.storage.endpoint).origin] : [])],
      frameSrc: ['https://accounts.google.com/gsi/', 'https://www.google.com', 'https://maps.google.com'],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
      upgradeInsecureRequests: config.production ? [] : null,
    } },
    strictTransportSecurity: config.production ? { maxAge: 31536000 } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }))
  app.use(['/api', '/contactus'], (req, res, next) => {
    const publicContent = req.method === 'GET' && req.originalUrl.split('?')[0] === '/api/content'
    res.set('Cache-Control', publicContent ? 'public, max-age=60, stale-while-revalidate=300' : 'no-store')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('Origin') !== config.origin) return next(httpError(403, 'Request origin is not allowed.'))
      if (isUploadRequest(req)) {
        if (!IMAGE_TYPES.some((type) => req.is(type))) return next(httpError(415, 'Upload a JPEG, PNG, or WebP image. SVG and other file types are not accepted.'))
      } else if (!req.is('application/json')) return next(httpError(415, 'Send application/json requests.'))
    }
    next()
  })
  app.use(express.json({ limit: '192kb' }))
  app.use(['/api', '/contactus'], (req, res, next) => {
    if (!isUploadRequest(req) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return next(httpError(400, 'Send a JSON object.'))
    next()
  })
  const requireAdmin = installAuth(app, { db: store, config, sendCode, verifyGoogle, now })
  app.get('/api/health', async (req, res) => { await store.prepare('SELECT 1').get(); res.json({ ok: true }) })
  app.get('/api/content', async (req, res) => res.json(await getContent(store)))
  app.use('/api/admin', requireAdmin)
  installAccess(app, { db: store, config, now })
  installUsers(app, { db: store, config, now })
  if (useLocalMedia) installUploads(app, { db: localDb, config, now })
  if (useNeonMedia) installNeonUploads(app, { db: store, config, now, ...(storageClient ? { s3: storageClient } : {}), ...(storageSign ? { sign: storageSign } : {}) })
  app.get('/api/admin/content', async (req, res) => res.json(await getAdminContent(store)))
  const audit = store.prepare('INSERT INTO audit_log(actor_id,action,kind,item_id,created_at) VALUES(?,?,?,?,?)')
  for (const kind of ['events', 'members']) {
    for (const method of ['post', 'put']) app[method](`/api/admin/${kind}${method === 'put' ? '/:id' : ''}`, async (req, res) => {
      await rateLimit(store, `admin:${req.user.id}`, 120, 60 * 1000, now())
      const value = validateContent(kind, req.body)
      if (useLocalMedia) assertUploadsExist(localDb, config, value)
      if (useNeonMedia) await assertObjectUploadsExist(store, config, value)
      const id = method === 'post' ? randomUUID() : req.params.id
      if (method === 'put' && !await store.prepare('SELECT 1 FROM content WHERE kind = ? AND id = ?').get(kind, id)) throw httpError(404, 'This item no longer exists. Refresh the list.')
      const slug = kind === 'events' ? eventSlug(value.title) : null
      if (slug && await store.prepare('SELECT 1 FROM content WHERE kind = ? AND slug = ? AND id != ?').get(kind, slug, id)) throw httpError(409, 'Another event uses this title/link. Choose a unique title.')
      const item = { ...value, id }
      await store.transaction(async () => {
        await assertAdminSession(store, config, req, now())
        if (kind === 'members' && method === 'put') {
          const linked = await store.prepare('SELECT user_id FROM member_accounts WHERE member_id = ?').get(id)
          if (linked) {
            if (await store.prepare('SELECT 1 FROM member_accounts WHERE user_id = ? AND batch = ? AND member_id != ?').get(linked.user_id, value.batch, id)) throw httpError(409, 'This user is already a member of that batch.')
            await store.prepare('UPDATE member_accounts SET batch = ? WHERE member_id = ?').run(value.batch, id)
            const account = await store.prepare('SELECT id,email FROM users WHERE id = ?').get(linked.user_id)
            if (account) item.account = account
          }
        }
        await store.prepare('INSERT INTO content(kind,id,slug,data) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET slug=excluded.slug,data=excluded.data')
          .run(kind, id, slug, JSON.stringify({ ...value, id }))
        await audit.run(req.user.id, method === 'post' ? 'create' : 'update', kind, id, now())
      })
      res.status(method === 'post' ? 201 : 200).json({ item })
    })
    app.delete(`/api/admin/${kind}/:id`, async (req, res) => {
      await rateLimit(store, `admin:${req.user.id}`, 120, 60 * 1000, now())
      await store.transaction(async () => {
        await assertAdminSession(store, config, req, now())
        if (kind === 'members') await store.prepare('DELETE FROM member_accounts WHERE member_id = ?').run(req.params.id)
        const result = await store.prepare('DELETE FROM content WHERE kind = ? AND id = ?').run(kind, req.params.id)
        if (!result.changes) throw httpError(404, 'This item no longer exists.')
        await audit.run(req.user.id, 'delete', kind, req.params.id, now())
      })
      res.status(204).end()
    })
  }
  app.post(['/api/contact', '/contactus'], async (req, res) => {
    await rateLimit(store, `contact:${req.ip}`, 5, 60 * 60 * 1000, now())
    const name = nameValue(req.body.name), email = emailValue(req.body.email)
    const message = req.body.message
    if (typeof message !== 'string' || message.trim().length < 10 || message.length > 5000) throw httpError(400, 'Message must be between 10 and 5,000 characters.')
    try { await sendContact({ name, email, message: message.trim() }) }
    catch (error) {
      // Keep SMTP details away from visitors, but leave a safe diagnostic in
      // the hosting logs so a missing app password or rejected sender can be
      // fixed without guessing.
      console.error('Contact email delivery failed:', error.code || error.message || 'unknown mail error')
      throw httpError(503, 'Your message could not be sent. Please try again later.')
    }
    res.json({ message: 'Your message has been sent. Thank you for reaching out!' })
  })
  app.use('/api', (req, res) => res.status(404).json({ message: 'API endpoint not found.' }))
  if (distPath && existsSync(path.join(distPath, 'index.html'))) {
    const indexPath = path.join(distPath, 'index.html')
    const indexDocument = readFileSync(indexPath, 'utf8')
    app.use('/assets', express.static(path.join(distPath, 'assets'), { maxAge: '1y', immutable: true }))
    app.use('/content-assets', express.static(path.join(distPath, 'content-assets'), { maxAge: '1d' }))
    app.use(express.static(distPath, { index: false, maxAge: '1h' }))
    app.use(['/assets', '/content-assets'], (req, res) => res.status(404).end())
    app.get('/{*splat}', async (req, res) => {
      const route = req.path.replace(/\/$/, '') || '/'
      const known = ['/', '/teams', '/events', '/contactus', '/signin', '/signup', '/reset-password', '/account', '/admin'].includes(route)
      let eventExists = false
      if (route.startsWith('/events/')) {
        let slug
        try { slug = decodeURIComponent(route.slice('/events/'.length)) } catch { slug = '' }
        eventExists = Boolean(await store.prepare("SELECT 1 FROM content WHERE kind = 'events' AND (slug = ? OR (? = 'navy-visit-2023' AND id = '2'))").get(slug, slug))
      }
      const needsBootstrap = route === '/' || route === '/teams' || route === '/events' || route.startsWith('/events/')
      const snapshot = needsBootstrap ? JSON.stringify(await getContent(store)).replace(/[<>&\u2028\u2029]/g, (character) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' })[character]) : ''
      const html = snapshot ? indexDocument.replace('</head>', `<script type="application/json" id="ecell-content-bootstrap">${snapshot}</script></head>`) : indexDocument
      res.set('Cache-Control', 'no-cache, must-revalidate')
      res.status(known || eventExists ? 200 : 404).type('html').send(html)
    })
  }
  // Never return SQL errors, tokens, credentials, or stack traces to the browser.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    const status = error.status >= 400 && error.status < 600 ? error.status : 500
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter))
    res.status(status).json({ message: status === 500 ? 'Something went wrong. Please try again.' : error.type === 'entity.too.large' ? isUploadRequest(req) ? 'Each image must be 8 MiB or smaller.' : 'The request is too large.' : error.type === 'entity.parse.failed' ? 'Invalid JSON request.' : status === 404 ? 'Resource not found.' : error.message })
  })
  return app
}
