import { emailValue, httpError, rateLimit } from './security.js'

export function accessFor(db, config, email) {
  const isOwner = config.adminEmails.has(email)
  const row = db.prepare('SELECT 1 FROM admin_grants WHERE email = ?').get(email)
  const result = (value) => ({ isOwner, isAdmin: isOwner || Boolean(value) })
  return row?.then ? row.then(result) : result(row)
}

// Recheck after awaits and while holding the mutation transaction lock.
export async function assertAdminSession(db, config, req, now = Date.now()) {
  if (!req.user || !(await accessFor(db, config, req.user.email)).isAdmin || !await db.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND user_id = ? AND expires_at > ?').get(req.session?.token_hash || '', req.user.id, now)) throw httpError(403, 'Your administrator access changed. Please sign in again.')
}

export function installAccess(app, { db, config, now = Date.now }) {
  const view = async (email, source) => {
    const user = await db.prepare('SELECT name FROM users WHERE email = ?').get(email)
    return { email, role: source === 'environment' ? 'owner' : 'admin', source, joined: Boolean(user), name: user?.name || null }
  }
  const ownersOnly = (req, res, next) => {
    if (!req.user || !config.adminEmails.has(req.user.email)) return next(httpError(403, 'Only a protected owner can manage administrator access.'))
    next()
  }
  app.use('/api/admin/access', ownersOnly)
  app.get('/api/admin/access', async (req, res) => {
    const admins = await Promise.all([...config.adminEmails].map((email) => view(email, 'environment')))
    const grants = await db.prepare('SELECT email FROM admin_grants ORDER BY email').all()
    for (const row of grants) if (!config.adminEmails.has(row.email)) admins.push(await view(row.email, 'database'))
    res.json({ admins, canManage: true })
  })
  app.post('/api/admin/access', async (req, res) => {
    await rateLimit(db, `access:${req.user.id}`, 30, 60 * 60 * 1000, now())
    const email = emailValue(req.body.email)
    await db.transaction(async () => {
      await assertAdminSession(db, config, req, now())
      if (config.adminEmails.has(email) || await db.prepare('SELECT 1 FROM admin_grants WHERE email = ?').get(email)) throw httpError(409, 'This email already has administrator access.')
      await db.prepare('INSERT INTO admin_grants(email,granted_by,created_at) VALUES(?,?,?)').run(email, req.user.id, now())
      await db.prepare('INSERT INTO audit_log(actor_id,action,kind,item_id,created_at) VALUES(?,?,?,?,?)').run(req.user.id, 'grant', 'admin-access', email, now())
    })
    res.status(201).json({ admin: await view(email, 'database') })
  })
  app.delete('/api/admin/access/:email', async (req, res) => {
    await rateLimit(db, `access:${req.user.id}`, 30, 60 * 60 * 1000, now())
    const email = emailValue(req.params.email)
    if (config.adminEmails.has(email)) throw httpError(409, 'Protected owners cannot be removed from the dashboard. Change ADMIN_EMAILS on the server only after confirming another owner can sign in.')
    await db.transaction(async () => {
      await assertAdminSession(db, config, req, now())
      const result = await db.prepare('DELETE FROM admin_grants WHERE email = ?').run(email)
      if (!result.changes) throw httpError(404, 'This administrator grant no longer exists.')
      await db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)').run(email)
      await db.prepare('INSERT INTO audit_log(actor_id,action,kind,item_id,created_at) VALUES(?,?,?,?,?)').run(req.user.id, 'revoke', 'admin-access', email, now())
    })
    res.status(204).end()
  })
}
