import { DatabaseSync, backup } from 'node:sqlite'
import { mkdirSync, existsSync, chmodSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadConfig, projectRoot } from '../backend/config.js'

// Use during a maintenance window: DB writes are blocked until images are copied.
// Never copy a live SQLite main file alone; committed rows can still be in the WAL.
if (!process.argv.includes('--maintenance-confirmed')) {
  console.error('Stop application traffic first. Then run: npm run backup -- --maintenance-confirmed [--output /private/backup/root]')
  process.exit(1)
}
process.umask(0o077)
const config = loadConfig()
const outputIndex = process.argv.indexOf('--output')
if (outputIndex !== -1 && (!process.argv[outputIndex + 1] || process.argv[outputIndex + 1].startsWith('--'))) throw new Error('--output requires a private directory path.')
const outputRoot = path.resolve(outputIndex === -1 ? path.join(projectRoot, 'backups') : process.argv[outputIndex + 1])
for (const exposed of ['public', 'dist'].map((name) => path.join(projectRoot, name))) if (outputRoot === exposed || outputRoot.startsWith(`${exposed}${path.sep}`)) throw new Error('Never store backups in a public directory.')
if (!existsSync(config.databasePath)) throw new Error('No database exists at DATABASE_PATH; refusing to create an empty backup.')
const destination = path.join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`)
const lock = new DatabaseSync(config.databasePath)
const source = new DatabaseSync(config.databasePath, { readOnly: true })
let locked = false, created = false
try {
  lock.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;')
  locked = true
  mkdirSync(path.join(destination, 'uploads'), { recursive: true, mode: 0o700 })
  created = true
  const targetDb = path.join(destination, 'ecell.sqlite')
  await backup(source, targetDb)
  chmodSync(targetDb, 0o600)
  const uploads = source.prepare('SELECT filename FROM uploads ORDER BY filename').all()
  for (const { filename } of uploads) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(filename)) throw new Error('Unexpected upload filename in database; inspect it before backing up.')
    const target = path.join(destination, 'uploads', filename)
    copyFileSync(path.join(config.uploadDir, filename), target)
    chmodSync(target, 0o600)
  }
  const verification = new DatabaseSync(targetDb, { readOnly: true })
  try {
    if (verification.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup integrity check failed.')
    const tables = ['users', 'content', 'uploads', 'admin_grants']
    const counts = Object.fromEntries(tables.map((table) => [table, verification.prepare(`SELECT count(*) AS count FROM ${table}`).get().count]))
    writeFileSync(path.join(destination, 'manifest.json'), `${JSON.stringify({ format: 1, createdAt: new Date().toISOString(), counts, note: 'Contains private account data. Restore database and uploads together. Environment secrets are not included.' }, null, 2)}\n`, { mode: 0o600 })
  } finally { verification.close() }
  lock.exec('COMMIT')
  locked = false
  console.log(`Verified database and ${uploads.length} uploaded images backed up to ${destination}`)
  console.log('Keep this backup private, encrypt off-site copies, and periodically test restoration.')
} catch (error) {
  if (locked) lock.exec('ROLLBACK')
  if (created) rmSync(destination, { recursive: true, force: true })
  throw error
} finally { source.close(); lock.close() }
