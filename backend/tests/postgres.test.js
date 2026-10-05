import test from 'node:test'
import assert from 'node:assert/strict'
import { postgresSql } from '../database.js'
import { createPostgresStore, POSTGRES_SCHEMA } from '../postgres.js'
import { loadConfig } from '../config.js'

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
