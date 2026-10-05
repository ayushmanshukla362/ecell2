import { httpError } from './security.js'

export async function selectedUsers(db, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !id || id.length > 100)) throw httpError(400, 'Select between 1 and 100 registered users.')
  const unique = [...new Set(ids)]
  const users = await db.prepare(`SELECT id,email,name FROM users WHERE id IN (${unique.map(() => '?').join(',')}) ORDER BY name,email`).all(...unique)
  if (users.length !== unique.length) throw httpError(400, 'Some selected accounts no longer exist. Refresh the user list and try again.')
  return users
}
