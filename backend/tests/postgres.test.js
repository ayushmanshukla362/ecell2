import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { postgresSql } from '../database.js'
import { createPostgresStore, migratePostgres, POSTGRES_SCHEMA } from '../postgres.js'
import { loadConfig } from '../config.js'
import { cleanup, createCleanupRunner, formatCleanupError } from '../store.js'

class RecordingPool {
  constructor() {
    this.queries = []
    this.client = {
      query: async (text, values = []) => {
        this.queries.push({ text, values, client: true })
        if (text.startsWith('SELECT')) return { rows: [{ one: 1 }], rowCount: 1 }
        if (text === 'DELETE FROM thing RETURNING id') return { rows: [{ id: 'one' }], rowCount: 1 }
        return { rows: [], rowCount: 0 }
      },
      release: () => { this.released = true },
    }
  }
  async query(text, values = []) {
    this.queries.push({ text, values, client: false })
    if (text.startsWith('SELECT')) return { rows: [{ one: 1 }], rowCount: 1 }
    if (text === 'DELETE FROM thing RETURNING id') return { rows: [{ id: 'one' }], rowCount: 1 }
    return { rows: [], rowCount: 0 }
  }
  async connect() { return this.client }
  async end() { this.ended = true }
}

class MigrationPool {
  constructor() {
    this.queries = []
    this.client = {
      query: async (text, values = []) => this.record(text, values, true),
      release: () => { this.released = true },
    }
  }
  record(text, values, client) {
    this.queries.push({ text, values, client })
    if (text.includes('INSERT INTO metadata')) return { rows: [{ key: 'content_seeded' }], rowCount: 1 }
    if (text.includes("FROM content WHERE kind = 'members'")) return { rows: [], rowCount: 0 }
    return { rows: [], rowCount: 0 }
  }
  async query(text, values = []) { return this.record(text, values, false) }
  async connect() { return this.client }
  async end() { this.ended = true }
}

test('postgresSql numbers only real SQLite bind placeholders', () => {
  const sql = postgresSql(`SELECT '?' AS literal, "?" AS identifier, ? AS first -- ? ignored\n/* ? ignored */ AND ? = '?'`)
  assert.equal(sql, `SELECT '?' AS literal, "?" AS identifier, $1 AS first -- ? ignored\n/* ? ignored */ AND $2 = '?'`)
})

test('Postgres store binds parameters and keeps transaction queries on one client', async () => {
  const pool = new RecordingPool()
  const store = createPostgresStore(pool)
  assert.deepEqual(await store.prepare('SELECT ?').get('bound'), { one: 1 })
  assert.deepEqual(await store.prepare('DELETE FROM thing RETURNING id').get(), { id: 'one' })
  await store.transaction(async () => {
    await store.prepare('INSERT INTO thing(value) VALUES(?)').run('inside')
    assert.equal(pool.queries.at(-1).client, true)
  })
  assert.equal(pool.queries.filter(({ text }) => text === 'BEGIN').length, 1)
  assert.equal(pool.queries.filter(({ text }) => text === 'COMMIT').length, 1)
  assert.equal(pool.released, true)
  await store.close()
  assert.equal(pool.ended, true)
})

test('Postgres cleanup batches all expired tables into one parameterized query', async () => {
  const pool = new RecordingPool()
  const store = createPostgresStore(pool)
  const now = 1700000000000

  await cleanup(store, now)

  assert.equal(pool.queries.length, 1)
  assert.match(pool.queries[0].text, /DELETE FROM sessions/)
  assert.match(pool.queries[0].text, /DELETE FROM challenges/)
  assert.match(pool.queries[0].text, /DELETE FROM auth_grants/)
  assert.match(pool.queries[0].text, /DELETE FROM rate_limits/)
  assert.match(pool.queries[0].text, /DELETE FROM oauth_nonces/)
  assert.match(pool.queries[0].text, /DELETE FROM upload_intents/)
  assert.deepEqual(pool.queries[0].values, [now, now, now, now, now, now])
})

test('scheduled cleanup skips overlaps and logs useful safe details for non-Error failures', async () => {
  let release
  const waiting = new Promise((resolve) => { release = resolve })
  let calls = 0
  const store = { dialect: 'postgres', prepare: () => ({ get: async () => { calls++; await waiting } }) }
  const messages = []
  const run = createCleanupRunner(store, { log: (...args) => messages.push(args) })

  const first = run()
  assert.equal(await run(), false)
  assert.equal(calls, 1)
  release()
  assert.equal(await first, true)

  const failure = createCleanupRunner({ dialect: 'postgres', prepare: () => ({ get: async () => {
    throw { code: 'ECONNRESET', message: 'postgresql://user:secret@example.invalid/db?password=secret' }
  } }) }, { log: (...args) => messages.push(args) })
  assert.equal(await failure(), false)
  assert.deepEqual(messages.at(-1), ['Database cleanup failed:', 'ECONNRESET: postgresql://[redacted]@example.invalid/db?password=[redacted]'])
  assert.equal(formatCleanupError('plain cleanup failure'), 'plain cleanup failure')
})

test('Postgres migration batches schema and seed writes inside its transaction', async () => {
  const pool = new MigrationPool()
  const store = createPostgresStore(pool)
  const seedFile = new URL('../seed-content.json', import.meta.url)
  const seed = JSON.parse(readFileSync(seedFile, 'utf8'))

  await migratePostgres(store, seedFile)

  assert.equal(pool.queries.filter(({ text }) => text.includes('CREATE TABLE IF NOT EXISTS')).length, 1)
  const seedQueries = pool.queries.filter(({ text }) => text.startsWith('INSERT INTO content'))
  assert.equal(seedQueries.length, 1)
  assert.equal(seedQueries[0].values.length, 4 * (seed.events.length + seed.members.length))
  assert.equal(pool.queries.filter(({ text }) => text === 'COMMIT').length, 1)
  await store.close()
  assert.equal(pool.ended, true)
})

test('Postgres schema contains every persistence table without contacting a database', () => {
  const schema = POSTGRES_SCHEMA.join('\n')
  for (const table of ['users', 'sessions', 'challenges', 'auth_grants', 'rate_limits', 'oauth_nonces', 'content', 'member_accounts', 'admin_grants', 'uploads', 'metadata', 'audit_log']) assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`))
})

test('DATABASE_URL selects cloud mode without requiring local runtime directories', () => {
  const config = loadConfig({
    AUTH_SECRET: 'x'.repeat(32),
    DATABASE_URL: 'postgresql://user:password@example.invalid/ecell?sslmode=require',
    DATABASE_PATH: '/path/that/does/not/exist/ecell.sqlite',
    UPLOAD_DIR: '/path/that/does/not/exist/uploads',
  })
  assert.equal(config.databaseUrl, 'postgresql://user:password@example.invalid/ecell?sslmode=require')
  assert.equal(config.mediaProvider, 'neon-object-storage')
  assert.equal(config.databasePath, '/path/that/does/not/exist/ecell.sqlite')
  assert.equal(config.uploadDir, '/path/that/does/not/exist/uploads')
})
