import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync, readFileSync, chmodSync } from 'node:fs'
import path from 'node:path'
import { asStore, isPromiseLike } from './database.js'
import { openPostgresStore } from './postgres.js'

export { openPostgresStore, createPostgresStore, migratePostgres, POSTGRES_SCHEMA } from './postgres.js'

export function openStore(filename, seedFile = new URL('./seed-content.json', import.meta.url)) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(filename)
  if (filename !== ':memory:') chmodSync(filename, 0o600)
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT, google_sub TEXT UNIQUE, verified_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS challenge_email ON challenges(email, purpose);
    CREATE TABLE IF NOT EXISTS auth_grants (
      token_hash TEXT PRIMARY KEY, email TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('signup','reset')),
      payload TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS grant_email ON auth_grants(email, purpose);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_nonces (hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS content (
      kind TEXT NOT NULL CHECK(kind IN ('events','members')), id TEXT NOT NULL,
      slug TEXT, data TEXT NOT NULL, PRIMARY KEY(kind, id), UNIQUE(kind, slug)
    );
    CREATE TABLE IF NOT EXISTS member_accounts (
      member_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      batch TEXT NOT NULL, UNIQUE(user_id, batch)
    );
    CREATE TABLE IF NOT EXISTS admin_grants (
      email TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
      created_by TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS upload_intents (
      id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL,
      content_type TEXT NOT NULL, size INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS upload_intents_expiry ON upload_intents(expires_at);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
      kind TEXT NOT NULL, item_id TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `)
  if (!db.prepare("SELECT 1 FROM metadata WHERE key = 'content_seeded'").get()) {
    if (!existsSync(seedFile)) { db.close(); throw new Error('Missing backend/seed-content.json. Run npm run content:export first.') }
    const seed = JSON.parse(readFileSync(seedFile, 'utf8'))
    db.exec('BEGIN IMMEDIATE')
    try {
      const insert = db.prepare('INSERT INTO content(kind,id,slug,data) VALUES(?,?,?,?)')
      for (const kind of ['events', 'members']) for (const item of seed[kind]) {
        const value = { ...item, id: String(item.id) }
        insert.run(kind, value.id, kind === 'events' ? eventSlug(value.title) : null, JSON.stringify(value))
      }
      db.prepare("INSERT INTO metadata(key,value) VALUES('content_seeded','1')").run()
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error }
  }
  // Repair only this exact malformed legacy URL; never overwrite an admin's edits.
  const legacyId = '2025-2026-executives-8-ishan-arora'
  const legacy = db.prepare("SELECT data FROM content WHERE kind = 'members' AND id = ?").get(legacyId)
  if (legacy) {
    const member = JSON.parse(legacy.data)
    if (member.instagram === 'https://www.instagram.com/ishan.arora21?ihttps://www.instagram.com/nandinigoel75?igsh=MTJuMDczbGJhNDg0dQ==gsh=aXAyZXd6a3ZvM2E1') {
      member.instagram = 'https://www.instagram.com/ishan.arora21/'
      db.prepare("UPDATE content SET data = ? WHERE kind = 'members' AND id = ? AND data = ?").run(JSON.stringify(member), legacyId, legacy.data)
    }
  }
  return db
}

export async function openStoreAsync(config, seedFile = new URL('./seed-content.json', import.meta.url)) {
  if (typeof config === 'string') return asStore(openStore(config, seedFile))
  if (config?.databaseUrl) return openPostgresStore(config.databaseUrl, { seedFile })
  return asStore(openStore(config?.databasePath, seedFile))
}

export const eventSlug = (title) => title.toLowerCase().replace(/ /g, '-')

function contentResult(rows) {
  const result = { events: [], members: [] }
  for (const row of rows) result[row.kind].push(JSON.parse(row.data))
  for (const items of Object.values(result)) items.sort((a, b) => (a.order || 0) - (b.order || 0)
    || (a.name || a.title || '').localeCompare(b.name || b.title || '')
    || a.id.localeCompare(b.id, undefined, { numeric: true }))
  return result
}

// Raw SQLite callers still receive the historical synchronous value. The
// normalized HTTP/Postgres stores return a Promise and are awaited by app.js.
export function getContent(db) {
  const rows = db.prepare('SELECT kind,data FROM content ORDER BY kind,id').all()
  return isPromiseLike(rows) ? rows.then(contentResult) : contentResult(rows)
}

// Keep cleanup synchronous for the existing local maintenance/tests while
// supporting the asynchronous adapter used by Neon.
export function cleanup(db, now = Date.now()) {
  const tables = ['sessions', 'challenges', 'auth_grants', 'rate_limits', 'oauth_nonces', 'upload_intents']
  const first = db.prepare(`DELETE FROM ${tables[0]} WHERE expires_at <= ?`).run(now)
  if (!isPromiseLike(first)) {
    for (const table of tables.slice(1)) db.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now)
    return undefined
  }
  return (async () => {
    await first
    for (const table of tables.slice(1)) await db.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now)
  })()
}
