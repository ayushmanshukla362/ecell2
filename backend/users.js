import { randomUUID } from 'node:crypto'
import { assertAdminSession } from './access.js'
import { getContent } from './store.js'
import { httpError, rateLimit } from './security.js'
import { validateContent } from './validation.js'
import { selectedUsers } from './user-selection.js'

// Account emails and identifiers belong only in authenticated admin responses.
export async function getAdminContent(db) {
  const content = await getContent(db)
  const links = await db.prepare('SELECT m.member_id,u.id,u.email FROM member_accounts m JOIN users u ON u.id = m.user_id').all()
  const accounts = new Map(links.map((row) => [row.member_id, { id: row.id, email: row.email }]))
  content.members = content.members.map((member) => accounts.has(member.id) ? { ...member, account: accounts.get(member.id) } : member)
  return content
}

export function installUsers(app, { db, config, now = Date.now }) {
  app.get('/api/admin/users', async (req, res) => {
    const { q = '', batch = '', year = '', page = '1' } = req.query
    if ([q, batch, year, page].some((value) => typeof value !== 'string') || q.length > 254 || (q.trim().length > 0 && q.trim().length < 2)) throw httpError(400, 'Search with at least 2 characters of an email or name.')
    if (batch && batch !== 'unassigned' && !/^\d{4}-\d{4}$/.test(batch)) throw httpError(400, 'Choose a valid team batch.')
    if (year && (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 2200)) throw httpError(400, 'Choose a valid signup year.')
    if (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 100000) throw httpError(400, 'Choose a valid results page.')
    const clauses = [], params = []
    if (q.trim()) {
      const search = `%${q.trim().toLowerCase().replace(/[\\%_]/g, '\\$&')}%`
      clauses.push("(LOWER(u.email) LIKE ? ESCAPE '\\' OR LOWER(u.name) LIKE ? ESCAPE '\\')")
      params.push(search, search)
    }
    if (batch === 'unassigned') clauses.push('NOT EXISTS (SELECT 1 FROM member_accounts m WHERE m.user_id = u.id)')
    else if (batch) { clauses.push('EXISTS (SELECT 1 FROM member_accounts m WHERE m.user_id = u.id AND m.batch = ?)'); params.push(batch) }
    if (year) { clauses.push('u.verified_at >= ? AND u.verified_at < ?'); params.push(Date.UTC(Number(year), 0, 1), Date.UTC(Number(year) + 1, 0, 1)) }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const total = Number((await db.prepare(`SELECT COUNT(*) AS count FROM users u ${where}`).get(...params)).count)
    const rows = await db.prepare(`SELECT u.id,u.email,u.name,u.verified_at,g.email AS granted_email FROM users u LEFT JOIN admin_grants g ON g.email = u.email ${where} ORDER BY LOWER(u.name),u.email LIMIT 30 OFFSET ?`).all(...params, (Number(page) - 1) * 30)
    const links = rows.length ? await db.prepare(`SELECT user_id,batch FROM member_accounts WHERE user_id IN (${rows.map(() => '?').join(',')}) ORDER BY batch DESC`).all(...rows.map((row) => row.id)) : []
    const batches = [...new Set((await db.prepare("SELECT data FROM content WHERE kind = 'members'").all()).map((row) => JSON.parse(row.data).batch))].sort().reverse()
    const yearExpression = db.dialect === 'postgres' ? "EXTRACT(YEAR FROM to_timestamp(verified_at / 1000.0) AT TIME ZONE 'UTC')" : "strftime('%Y', verified_at / 1000, 'unixepoch')"
    const years = (await db.prepare(`SELECT DISTINCT ${yearExpression} AS year FROM users ORDER BY year DESC`).all()).map((row) => String(row.year))
    res.json({ users: rows.map((row) => ({ id: row.id, email: row.email, name: row.name, joinedYear: new Date(row.verified_at).getUTCFullYear(), isAdmin: config.adminEmails.has(row.email) || Boolean(row.granted_email), batches: links.filter((link) => link.user_id === row.id).map((link) => link.batch) })), batches, years, total, page: Number(page), pageSize: 30 })
  })

  app.post('/api/admin/members/bulk', async (req, res) => {
    await rateLimit(db, `admin:${req.user.id}`, 120, 60 * 1000, now())
    const template = validateContent('members', { ...req.body, name: 'Registered member', image: '', instagram: '', linkedin: '', description: '' })
    const items = [], skipped = []
    await db.transaction(async () => {
      await assertAdminSession(db, config, req, now())
      const users = await selectedUsers(db, req.body.userIds)
      const existing = new Set((await db.prepare('SELECT user_id FROM member_accounts WHERE batch = ?').all(template.batch)).map((row) => row.user_id))
      for (const user of users) {
        if (existing.has(user.id)) { skipped.push(user); continue }
        const item = { ...template, name: user.name, id: randomUUID() }
        items.push({ ...item, account: { id: user.id, email: user.email } })
      }
      if (items.length) {
        await db.prepare(`INSERT INTO content(kind,id,slug,data) VALUES ${items.map(() => "('members',?,NULL,?)").join(',')}`).run(...items.flatMap((item) => [item.id, JSON.stringify({ ...template, name: item.name, id: item.id })]))
        await db.prepare(`INSERT INTO member_accounts(member_id,user_id,batch) VALUES ${items.map(() => '(?,?,?)').join(',')}`).run(...items.flatMap((item) => [item.id, item.account.id, item.batch]))
        await db.prepare(`INSERT INTO audit_log(actor_id,action,kind,item_id,created_at) VALUES ${items.map(() => '(?,?,?,?,?)').join(',')}`).run(...items.flatMap((item) => [req.user.id, 'create', 'members', item.id, now()]))
      }
    })
    res.status(201).json({ items, skipped })
  })
}
