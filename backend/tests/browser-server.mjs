// Isolated browser-test server. This file is never imported by the real server.
// Mail is captured locally for example.test addresses only; no SMTP calls occur.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createApp } from '../app.js'
import { openStore } from '../store.js'
import { loadConfig, projectRoot } from '../config.js'

const folder = path.join(projectRoot, 'test-results', 'browser-data')
rmSync(folder, { recursive: true, force: true })
mkdirSync(folder, { recursive: true })
const outbox = {}
writeFileSync(path.join(folder, 'mail.json'), JSON.stringify(outbox))
const config = loadConfig({
  AUTH_SECRET: 'isolated-browser-test-secret-not-for-production',
  APP_ORIGIN: 'http://127.0.0.1:4174', PORT: '4174',
  // Simulate distinct client IPs per browser project behind one trusted test proxy.
  // Production rate-limit thresholds remain unchanged and are tested separately.
  TRUST_PROXY_HOPS: '1',
  GOOGLE_CLIENT_ID: 'isolated-browser-provider-mock.apps.googleusercontent.com',
  ADMIN_EMAILS: 'admin+desktop@example.test,admin+mobile@example.test,manager+desktop@example.test,manager+mobile@example.test,bulkowner+desktop@example.test,bulkowner+mobile@example.test',
  UPLOAD_DIR: path.join(folder, 'uploads'),
})
const db = openStore(path.join(folder, 'test.sqlite'))
const app = createApp({
  db, config, distPath: path.join(projectRoot, 'dist'),
  sendCode: async (email, code) => {
    if (!email.endsWith('@example.test')) throw new Error('Only test addresses are allowed.')
    outbox[email] = code
    writeFileSync(path.join(folder, 'mail.json'), JSON.stringify(outbox))
  },
  sendContact: async () => {},
  // TEST-ONLY provider adapter, never a real Google verifier. Playwright mocks GIS
  // and supplies a nonce-bound fixture; production still verifies signed ID tokens.
  // Only this disposable server accepts these tightly scoped example.test users.
  verifyGoogle: async (credential) => {
    if (typeof credential !== 'string' || !credential.startsWith('browser-google-fixture:')) throw new Error('Expected an isolated provider fixture.')
    const fixture = JSON.parse(Buffer.from(credential.slice('browser-google-fixture:'.length), 'base64url').toString('utf8'))
    if (typeof fixture.email !== 'string' || !/^[a-z0-9.+_-]+@example\.test$/.test(fixture.email) || typeof fixture.nonce !== 'string' || fixture.nonce.length < 16) throw new Error('Invalid provider fixture.')
    return { email: fixture.email, sub: `browser-google:${fixture.email}`, name: 'Google Test Member', email_verified: true, hd: 'example.test', nonce: fixture.nonce }
  },
})
const server = app.listen(config.port, '127.0.0.1')
const shutdown = () => server.close(() => { db.close(); process.exit(0) })
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
