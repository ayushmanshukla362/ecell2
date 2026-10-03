import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { emailValue } from './security.js'

export const projectRoot = fileURLToPath(new URL('../', import.meta.url))
dotenv.config({ path: process.env.ENV_FILE || path.join(projectRoot, '.env'), quiet: true })

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const origin = env.APP_ORIGIN || 'http://localhost:5173'
  const parsed = new URL(origin)
  if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('APP_ORIGIN must be an exact http(s) origin without a trailing slash.')
  if (production && parsed.protocol !== 'https:') throw new Error('Production APP_ORIGIN must use HTTPS.')
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new Error('Set AUTH_SECRET to a random secret of at least 32 characters in your private environment file.')
  const port = Number(env.PORT || 8000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.')
  let adminEmails
  try { adminEmails = new Set((env.ADMIN_EMAILS || '').split(',').map((email) => email.trim()).filter(Boolean).map(emailValue)) }
  catch { throw new Error('ADMIN_EMAILS must contain comma-separated email addresses.') }
  if (production && !adminEmails.size) throw new Error('Production requires at least one protected owner in ADMIN_EMAILS.')
  if (production && (!env.EMAIL_USER || !env.EMAIL_PASS)) throw new Error('Production requires EMAIL_USER and EMAIL_PASS for email signup and password recovery.')
  if (env.EMAIL_USER) emailValue(env.EMAIL_USER)
  const databaseUrl = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL.trim() : ''
  if (databaseUrl) {
    let parsedDatabaseUrl
    try { parsedDatabaseUrl = new URL(databaseUrl) } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.') }
    if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.')
  }
  const databasePath = path.resolve(projectRoot, env.DATABASE_PATH || 'backend/data/ecell.sqlite')
  const uploadDir = path.resolve(projectRoot, env.UPLOAD_DIR || 'backend/data/uploads')
  const publicDirs = [path.join(projectRoot, 'public'), path.join(projectRoot, 'dist')]
  if (publicDirs.some((root) => [databasePath, uploadDir].some((location) => location === root || location.startsWith(`${root}${path.sep}`)))) throw new Error('Private runtime storage must be outside public/ and dist/.')
  const mediaProvider = (env.MEDIA_PROVIDER || (databaseUrl ? 'neon-object-storage' : 'local')).trim().toLowerCase()
  if (!['local', 'neon-object-storage'].includes(mediaProvider)) throw new Error('MEDIA_PROVIDER must be local or neon-object-storage.')
  if (databaseUrl && mediaProvider === 'local') throw new Error('DATABASE_URL deployments must use MEDIA_PROVIDER=neon-object-storage; local upload disk is not persistent on Vercel.')
  if (production && mediaProvider === 'neon-object-storage' && !databaseUrl) throw new Error('Production Neon Object Storage requires DATABASE_URL.')
  const storage = {
    bucket: (env.NEON_STORAGE_BUCKET || '').trim(),
    endpoint: (env.AWS_ENDPOINT_URL_S3 || '').trim(),
    region: (env.AWS_REGION || '').trim(),
    accessKeyId: (env.AWS_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (env.AWS_SECRET_ACCESS_KEY || '').trim(),
  }
  if (mediaProvider === 'neon-object-storage' && production && Object.values(storage).some((value) => !value)) throw new Error('Production Neon Object Storage requires NEON_STORAGE_BUCKET, AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.')
  if (mediaProvider === 'neon-object-storage' && storage.endpoint) {
    try { if (!['https:'].includes(new URL(storage.endpoint).protocol)) throw new Error('bad protocol') }
    catch { throw new Error('AWS_ENDPOINT_URL_S3 must be an exact HTTPS endpoint.') }
  }
  const uploadLimitMb = Number(env.UPLOAD_STORAGE_LIMIT_MB || 1024)
  if (!Number.isInteger(uploadLimitMb) || uploadLimitMb < 16 || uploadLimitMb > 102400) throw new Error('UPLOAD_STORAGE_LIMIT_MB must be an integer between 16 and 102400.')
  const proxyHops = Number(env.TRUST_PROXY_HOPS || 0)
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be 0–5, matching your trusted reverse proxy topology.')
  return {
    production, origin, port, adminEmails, proxyHops,
    secret: env.AUTH_SECRET,
    databaseUrl, mediaProvider, storage,
    databasePath, uploadDir,
    uploadQuotaBytes: uploadLimitMb * 1024 * 1024,
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    emailUser: env.EMAIL_USER || '',
    emailPass: env.EMAIL_PASS || '',
    emailFrom: env.EMAIL_FROM || env.EMAIL_USER || '',
    contactEmail: env.CONTACT_EMAIL || env.EMAIL_USER || '',
    sessionMs: 8 * 60 * 60 * 1000,
    codeMs: 10 * 60 * 1000,
  }
}
