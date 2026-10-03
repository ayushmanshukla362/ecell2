import { existsSync, accessSync, constants } from 'node:fs'
import path from 'node:path'
import { loadConfig, projectRoot } from '../backend/config.js'

try {
  const config = loadConfig()
  const ancestor = (location) => {
    let current = location
    while (!existsSync(current)) current = path.dirname(current)
    return current
  }
  if (!config.databaseUrl) {
    accessSync(ancestor(path.dirname(config.databasePath)), constants.W_OK)
    accessSync(ancestor(config.uploadDir), constants.W_OK)
  }
  console.log(`Configuration valid for ${config.production ? 'production' : 'development'}.`)
  console.log(`Browser origin: ${config.origin}`)
  console.log(`Protected owners: ${config.adminEmails.size}`)
  console.log(`Gmail credentials: ${config.emailUser && config.emailPass ? 'configured (not tested)' : 'missing — email signup/recovery unavailable'}`)
  console.log(`Google client: ${config.googleClientId ? 'configured (not tested)' : 'not configured — email authentication only'}`)
  console.log(`Database: ${config.databaseUrl ? 'Neon PostgreSQL (DATABASE_URL configured)' : config.databasePath}`)
  console.log(`Media provider: ${config.mediaProvider}`)
  if (!config.databaseUrl) console.log(`Uploaded images: ${config.uploadDir}`)
  console.log(`Image quota: ${config.uploadQuotaBytes / 1024 / 1024} MiB`)
  if (config.production && !existsSync(path.join(projectRoot, 'dist/index.html'))) throw new Error('Production frontend is missing. Run npm run build first.')
  console.log(config.databaseUrl ? 'Neon database configured; local database/upload disk checks were skipped. No email, database, or Google sign-in was attempted.' : 'Runtime storage ancestors are writable. No email or Google sign-in was attempted.')
  if (!config.production) console.log('For launch validation, set NODE_ENV=production and your HTTPS APP_ORIGIN, then rerun this command.')
} catch (error) {
  // Config errors contain field names only, never secret values.
  console.error(`Configuration check failed: ${error.message}`)
  process.exitCode = 1
}
