import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setup } from './helpers.js'
import { openStore } from '../store.js'

function seedUser(f, email, year = 2025, name = 'Directory Member') {
  const id = randomUUID()
  f.db.prepare('INSERT INTO users(id,email,name,verified_at) VALUES(?,?,?,?)').run(id, email, name, Date.UTC(year, 3, 10))
  return id
}
const team = (userIds, batch = '2025-2026') => ({ userIds, batch, group: 'volunteers', role: 'Technology', order: 5, featured: false })

test('user directory is admin-only, supports literal partial search, and paginates without private auth data', async (t) => {
  const f = await setup(t)
  const owner = await f.account(), student = await f.account('student@example.com')
  for (let n = 0; n < 35; n++) seedUser(f, `batch_${String(n).padStart(2, '0')}@example.com`, n % 2 ? 2025 : 2026)
  assert.equal((await f.request('/api/admin/users')).status, 401)
  assert.equal((await f.request('/api/admin/users', student)).status, 403)
  for (const params of ['q=a', 'q=ab&q=cd', 'page=-1', 'page=NaN', 'year=oops', 'batch=bad']) assert.equal((await f.request(`/api/admin/users?${params}`, owner)).status, 400, params)
  const result = await f.request('/api/admin/users?q=BATCH_', owner)
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.equal(result.body.total, 35)
  assert.equal(result.body.users.length, 30)
  assert.deepEqual(Object.keys(result.body.users[0]).sort(), ['batches', 'email', 'id', 'isAdmin', 'joinedYear', 'name'])
  const next = await f.request('/api/admin/users?q=batch_&page=2', owner)
  assert.equal(next.body.users.length, 5)
  assert.ok(!next.body.users.some((user) => result.body.users.some((row) => row.id === user.id)))
  assert.equal((await f.request('/api/admin/users?q=batch_&year=2025', owner)).body.total, 17)
  assert.equal((await f.request('/api/admin/users?q=Directory', owner)).body.total, 35)
  assert.equal((await f.request('/api/admin/users?q=%25%25', owner)).body.total, 0)
  assert.equal((await f.request('/api/admin/users?q=%27%20OR%201%3D1', owner)).body.total, 0)
})

test('bulk team additions persist private account links, skip duplicates, and maintain links when editing or deleting', async (t) => {
  const f = await setup(t)
  const owner = await f.account()
  const first = seedUser(f, 'first@example.com'), second = seedUser(f, 'second@example.com', 2026)
  const result = await f.request('/api/admin/members/bulk', { ...owner, method: 'POST', body: team([first, second, first]) })
  assert.equal(result.status, 201, JSON.stringify(result.body))
  assert.equal(result.body.items.length, 2)
  assert.equal(result.body.items[0].role, 'Technology')
  assert.deepEqual(result.body.skipped, [])
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM member_accounts').get().n, 2)
  const publicContent = (await f.request('/api/content')).body
  assert.equal(publicContent.members.length, 2)
  for (const member of publicContent.members) {
    assert.equal(member.account, undefined)
    assert.equal(member.email, undefined)
    assert.equal(member.userId, undefined)
  }
  const adminContent = (await f.request('/api/admin/content', owner)).body
  const firstMember = adminContent.members.find((member) => member.account?.email === 'first@example.com')
  assert.equal(firstMember?.account.email, 'first@example.com')
  const directory = await f.request('/api/admin/users?batch=2025-2026&year=2025', owner)
  assert.equal(directory.body.total, 1)
  assert.deepEqual(directory.body.users[0].batches, ['2025-2026'])
  assert.ok(directory.body.batches.includes('2025-2026'))
  const repeated = await f.request('/api/admin/members/bulk', { ...owner, method: 'POST', body: team([first, second]) })
  assert.equal(repeated.body.items.length, 0)
  assert.equal(repeated.body.skipped.length, 2)
  const anotherBatch = await f.request('/api/admin/members/bulk', { ...owner, method: 'POST', body: team([first], '2026-2027') })
  assert.equal(anotherBatch.body.items.length, 1)
  const item = result.body.items.find((item) => item.account.id === first)
  const conflict = await f.request(`/api/admin/members/${item.id}`, { ...owner, method: 'PUT', body: { ...item, batch: '2026-2027' } })
  assert.equal(conflict.status, 409)
  const updated = await f.request(`/api/admin/members/${item.id}`, { ...owner, method: 'PUT', body: { ...item, batch: '2027-2028', role: 'Lead' } })
  assert.equal(updated.status, 200)
  assert.equal(updated.body.item.account.email, 'first@example.com')
  assert.equal((await f.request('/api/admin/users?batch=2025-2026', owner)).body.total, 1)
  assert.equal((await f.request('/api/admin/users?batch=2027-2028', owner)).body.total, 1)
  assert.ok(!(await f.request('/api/content')).body.members.some((member) => member.account))
  await f.request(`/api/admin/members/${result.body.items.find((item) => item.account.id === second).id}`, { ...owner, method: 'DELETE' })
  const unassigned = (await f.request('/api/admin/users?q=second&batch=unassigned', owner)).body
  assert.equal(unassigned.total, 1)
  assert.deepEqual(unassigned.users[0].batches, [])
  const reopened = openStore(f.filename, f.seed)
  assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM member_accounts').get().n, 2)
  reopened.close()
})

test('bulk operations validate the complete selection and roll back on failure', async (t) => {
  const f = await setup(t)
  const owner = await f.account(), first = seedUser(f, 'valid@example.com')
  for (const endpoint of ['/api/admin/members/bulk', '/api/admin/access/bulk']) {
    for (const ids of [[], ['missing', first], Array(101).fill(first), [1]]) {
      const result = await f.request(endpoint, { ...owner, method: 'POST', body: team(ids) })
      assert.equal(result.status, 400, JSON.stringify(result.body))
    }
    assert.equal((await f.request(endpoint, { cookie: owner.cookie, method: 'POST', body: team([first]) })).status, 403)
  }
  assert.equal((await f.request('/api/admin/members/bulk', { ...owner, method: 'POST', body: team([first], '2025-2027') })).status, 400)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM content').get().n, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM admin_grants').get().n, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n, 0)
  f.db.exec("CREATE TRIGGER fail_member BEFORE INSERT ON member_accounts BEGIN SELECT RAISE(ABORT, 'test persistence failure'); END")
  assert.equal((await f.request('/api/admin/members/bulk', { ...owner, method: 'POST', body: team([first]) })).status, 500)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM content').get().n, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n, 0)
})

test('only owners can grant bulk access; existing sessions gain privileges and repeats safely skip owners/admins', async (t) => {
  const f = await setup(t)
  const owner = await f.account(), student = await f.account('student@example.com')
  const another = seedUser(f, 'another@example.com')
  const result = await f.request('/api/admin/access/bulk', { ...owner, method: 'POST', body: { userIds: [student.user.id, another, owner.user.id] } })
  assert.equal(result.status, 201, JSON.stringify(result.body))
  assert.equal(result.body.admins.length, 2)
  assert.equal(result.body.skipped[0].email, owner.user.email)
  assert.equal((await f.request('/api/admin/content', student)).status, 200)
  assert.equal((await f.request('/api/auth/session', student)).body.user.isAdmin, true)
  assert.equal((await f.request('/api/admin/users?q=student', student)).body.users[0].isAdmin, true)
  assert.equal((await f.request('/api/admin/access/bulk', { ...student, method: 'POST', body: { userIds: [another] } })).status, 403)
  assert.equal((await f.request('/api/admin/members/bulk', { ...student, method: 'POST', body: team([another]) })).status, 201)
  const repeated = await f.request('/api/admin/access/bulk', { ...owner, method: 'POST', body: { userIds: [student.user.id, another] } })
  assert.deepEqual(repeated.body.admins, [])
  assert.equal(repeated.body.skipped.length, 2)
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'grant'").get().n, 2)
})
