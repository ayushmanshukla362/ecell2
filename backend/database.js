import { AsyncLocalStorage } from 'node:async_hooks'

const wrappers = new WeakMap()

export const isPromiseLike = (value) => value && typeof value.then === 'function'
export const isAsyncStore = (value) => Boolean(value?.isAsyncStore)

// SQLite remains a synchronous public API for local scripts and tests. HTTP
// code uses this normalized asynchronous wrapper, which serializes standalone
// SQLite operations and keeps all operations inside one async transaction on
// the same connection.
export function asStore(raw) {
  if (raw?.isAsyncStore) return raw
  if (!raw || typeof raw.prepare !== 'function') throw new TypeError('A database store is required.')
  if (wrappers.has(raw)) return wrappers.get(raw)
  const context = new AsyncLocalStorage()
  let tail = Promise.resolve()
  const exclusive = async (work) => {
    const previous = tail
    let release
    tail = new Promise((resolve) => { release = resolve })
    await previous
    try { return await work() } finally { release() }
  }
  const run = (work) => context.getStore()?.active ? Promise.resolve().then(work) : exclusive(work)
  const store = {
    dialect: 'sqlite',
    isAsyncStore: true,
    raw,
    prepare(sql) {
      return Object.fromEntries(['get', 'all', 'run'].map((method) => [method, (...params) => run(() => raw.prepare(sql)[method](...params))]))
    },
    exec: (sql) => run(() => raw.exec(sql)),
    async transaction(work) {
      if (context.getStore()?.active) return Promise.resolve().then(work)
      return exclusive(async () => {
        const scope = { active: true }
        raw.exec('BEGIN IMMEDIATE')
        try {
          const result = await context.run(scope, work)
          raw.exec('COMMIT')
          return result
        } catch (error) {
          try { raw.exec('ROLLBACK') } catch { /* preserve the original failure */ }
          throw error
        } finally { scope.active = false }
      })
    },
    close: () => exclusive(() => raw.close()),
  }
  wrappers.set(raw, store)
  return store
}

// Translate the small, trusted SQL vocabulary shared by the SQLite and
// PostgreSQL adapters. Quoted strings, identifiers, and comments are skipped,
// so a literal '?' is never treated as a bind parameter.
export function postgresSql(sql) {
  let index = 0
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?/g, (part) => part === '?' ? `$${++index}` : part)
}
