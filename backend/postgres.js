import { readFile } from 'node:fs/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Pool, types } from 'pg'
import { postgresSql } from './database.js'

export { postgresSql }

export const POSTGRES_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    password_hash TEXT, google_sub TEXT UNIQUE, verified_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL, expires_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS challenge_email ON challenges(email, purpose)`,
  `CREATE TABLE IF NOT EXISTS auth_grants (
    token_hash TEXT PRIMARY KEY, email TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK(purpose IN ('signup','reset')),
    payload TEXT NOT NULL, expires_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS grant_email ON auth_grants(email, purpose)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_nonces (hash TEXT PRIMARY KEY, expires_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS content (
    kind TEXT NOT NULL CHECK(kind IN ('events','members')), id TEXT NOT NULL,
    slug TEXT, data TEXT NOT NULL, PRIMARY KEY(kind, id), UNIQUE(kind, slug)
  )`,
  `CREATE TABLE IF NOT EXISTS admin_grants (
    email TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    size BIGINT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
    created_by TEXT NOT NULL, created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS upload_intents (
    id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL,
    content_type TEXT NOT NULL, size BIGINT NOT NULL, expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS upload_intents_expiry ON upload_intents(expires_at)`,
  `CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
    kind TEXT NOT NULL, item_id TEXT NOT NULL, created_at BIGINT NOT NULL
  )`,
]

const statementResult = (result, method) => {
  if (method === 'get') return result.rows[0]
  if (method === 'all') return result.rows
  return { changes: result.rowCount, rowCount: result.rowCount }
}

const normalizeSql = (sql) => sql.replace(/\bBEGIN\s+IMMEDIATE\b/gi, 'BEGIN')

// This adapter deliberately exposes asynchronous get/all/run methods. A Pool
// connection is selected from AsyncLocalStorage while a transaction is active,
// so a transaction never accidentally hops between Neon/pg clients.
export function createPostgresStore(pool) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') throw new TypeError('A pg Pool is required.')
  const context = new AsyncLocalStorage()
  const store = {
    dialect: 'postgres',
    isAsyncStore: true,
    pool,
    prepare(sql) {
      const text = normalizeSql(postgresSql(sql))
      return Object.fromEntries(['get', 'all', 'run'].map((method) => [method, async (...params) => {
        const scope = context.getStore()
        const client = scope?.active ? scope.client : pool
        const result = await client.query(text, params)
        return statementResult(result, method)
      }]))
    },
    exec: async (sql) => {
      const scope = context.getStore()
      const client = scope?.active ? scope.client : pool
      return client.query(normalizeSql(sql))
    },
    async transaction(work) {
      const active = context.getStore()
      if (active?.active) return work()
      const client = await pool.connect()
      const scope = { client, active: true }
      try {
        await client.query('BEGIN')
        // Match SQLite BEGIN IMMEDIATE for short critical sections across
        // Vercel instances and Neon's pooler. No remote I/O under this lock.
        await client.query("SET LOCAL lock_timeout = '10s'")
        await client.query('SELECT pg_advisory_xact_lock(183523, 1)')
        const result = await context.run(scope, work)
        await client.query('COMMIT')
        return result
      } catch (error) {
        try { await client.query('ROLLBACK') } catch { /* preserve the original failure */ }
        throw error
      } finally { scope.active = false; client.release() }
    },
    close: () => pool.end(),
  }
  return store
}

const seedSlug = (title) => title.toLowerCase().replace(/ /g, '-')
const seedUrl = new URL('./seed-content.json', import.meta.url)

async function readSeed(seedFile) {
  const source = seedFile instanceof URL ? seedFile : seedFile
  return JSON.parse(await readFile(source, 'utf8'))
}

export async function migratePostgres(store, seedFile = seedUrl) {
  // Serialize DDL too: CREATE TABLE IF NOT EXISTS alone is not concurrency-safe
  // on simultaneous fresh PostgreSQL cold starts.
  await store.transaction(async () => {
    for (const statement of POSTGRES_SCHEMA) await store.exec(statement)
    const claimed = await store.prepare(`INSERT INTO metadata(key,value) VALUES('content_seeded','1')
      ON CONFLICT(key) DO NOTHING RETURNING key`).get()
    if (claimed) {
      let seed
      try { seed = await readSeed(seedFile) }
      catch (error) { throw new Error('Missing backend/seed-content.json. Run npm run content:export first.', { cause: error }) }
      const insert = store.prepare('INSERT INTO content(kind,id,slug,data) VALUES(?,?,?,?)')
      for (const kind of ['events', 'members']) for (const item of seed[kind] || []) {
        const value = { ...item, id: String(item.id) }
        await insert.run(kind, value.id, kind === 'events' ? seedSlug(value.title) : null, JSON.stringify(value))
      }
    }
  })

  // Repair only this exact malformed legacy URL; never overwrite an admin's
  // edits. Keep this migration identical to the local SQLite path.
  const legacyId = '2025-2026-executives-8-ishan-arora'
  const legacy = await store.prepare("SELECT data FROM content WHERE kind = 'members' AND id = ?").get(legacyId)
  if (legacy) {
    const member = JSON.parse(legacy.data)
    if (member.instagram === 'https://www.instagram.com/ishan.arora21?ihttps://www.instagram.com/nandinigoel75?igsh=MTJuMDczbGJhNDg0dQ==gsh=aXAyZXd6a3ZvM2E1') {
      member.instagram = 'https://www.instagram.com/ishan.arora21/'
      await store.prepare("UPDATE content SET data = ? WHERE kind = 'members' AND id = ? AND data = ?")
        .run(JSON.stringify(member), legacyId, legacy.data)
    }
  }
  return store
}

export async function openPostgresStore(databaseUrl, options = {}) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL.')
  const ownsPool = !options.pool
  const pool = options.pool || new Pool({
    connectionString: databaseUrl,
    max: options.max ?? 4,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 5000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 20000,
    allowExitOnIdle: true,
    types: { getTypeParser(oid, format) {
      if (oid === 20 && format !== 'binary') return (value) => {
        const number = Number(value)
        if (!Number.isSafeInteger(number)) throw new Error('Database integer outside supported range.')
        return number
      }
      return types.getTypeParser(oid, format)
    } },
  })
  // Idle pool errors must not terminate a warm function or print credentials.
  if (ownsPool) pool.on('error', () => console.error('PostgreSQL connection interrupted.'))
  const store = createPostgresStore(pool)
  try {
    await migratePostgres(store, options.seedFile)
    return store
  } catch (error) {
    if (ownsPool) await pool.end().catch(() => {})
    throw error
  }
}
