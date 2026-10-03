import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt)
export const token = () => randomBytes(32).toString('base64url')
export const digest = (value) => createHash('sha256').update(value).digest('hex')
export const codeDigest = (secret, id, code) => createHmac('sha256', secret).update(`${id}:${code}`).digest('hex')
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `scrypt:${salt}:${hash.toString('hex')}`
}
export async function checkPassword(password, encoded) {
  // A fixed dummy hash keeps unknown-email and wrong-password work comparable.
  const [, salt, expected] = (encoded || `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':')
  const actual = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return equal(actual.toString('hex'), expected) && Boolean(encoded)
}
export function httpError(status, message) { return Object.assign(new Error(message), { status }) }
export function emailValue(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  // Accept a single mailbox, never display names, comments, lists, or header syntax.
  if (normalized.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(normalized) || normalized.split('@')[0].length > 64) throw httpError(400, 'Enter a valid email address.')
  return normalized
}
export function passwordValue(value, isNew = false) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 256 || value.length < (isNew ? 12 : 1)) throw httpError(400, isNew ? 'Use a password of at least 12 characters (maximum 256 bytes).' : 'Enter a valid password.')
  return value
}
export function nameValue(value) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 120 || /[\r\n]/.test(value)) throw httpError(400, 'Use a name between 2 and 120 characters.')
  return value.trim()
}
export function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const at = part.indexOf('=')
    return at === -1 ? ['', ''] : [part.slice(0, at).trim(), part.slice(at + 1).trim()]
  }))
}

// Stored in the database so restarting an instance does not reset brute-force
// limits. This supports raw synchronous SQLite callers and async pg stores.
export function rateLimit(db, key, limit, windowMs, now = Date.now()) {
  const row = db.prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN rate_limits.expires_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
    expires_at = CASE WHEN rate_limits.expires_at <= ? THEN excluded.expires_at ELSE rate_limits.expires_at END
    RETURNING count,expires_at`).get(key, now + windowMs, now, now)
  const check = (value) => {
    if (value.count > limit) throw Object.assign(httpError(429, 'Too many attempts. Please wait and try again.'), { retryAfter: Math.ceil((value.expires_at - now) / 1000) })
  }
  return row?.then ? row.then(check) : check(row)
}
