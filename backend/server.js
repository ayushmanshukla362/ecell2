import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'
import { googleVerifier } from './google.js'
import { loadConfig, projectRoot } from './config.js'
import { openStoreAsync, createCleanupRunner } from './store.js'
import { createApp } from './app.js'

// Protect any local SQLite/WAL files created by this process from other OS users.
process.umask(0o077)

let runtimePromise
export function getRuntime() {
  if (!runtimePromise) runtimePromise = initializeRuntime()
  return runtimePromise
}

async function initializeRuntime() {
  const config = loadConfig()
  const db = await openStoreAsync(config)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: config.emailUser, pass: config.emailPass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  })
  const sendMail = (message) => {
    if (!config.emailUser || !config.emailPass || !config.emailFrom) throw new Error('Email is not configured.')
    return transporter.sendMail({ from: config.emailFrom, ...message })
  }
  const app = createApp({
    db, config, distPath: path.join(projectRoot, 'dist'),
    sendCode: (email, code, purpose) => sendMail({
      to: email,
      subject: 'Your E-Cell verification code',
      text: `Your E-Cell ${purpose === 'reset' ? 'password setup / recovery' : 'email signup'} verification code is ${code}.\n\nIt expires in 10 minutes and can only be used once. Enter it on the website to verify your email, then choose your password. Never share this code. If you did not request it, ignore it. Google sign-in does not require an E-Cell email code.`,
    }),
    sendContact: ({ name, email, message }) => sendMail({
      to: config.contactEmail, replyTo: email,
      subject: `E-Cell website message from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    }),
    verifyGoogle: googleVerifier(config.googleClientId),
  })
  return { app, db, config }
}

// Vercel/other serverless integrations can import either getApp or the
// handler without opening a connection until the first request.
export async function getApp() {
  return (await getRuntime()).app
}
export default async function handler(req, res) {
  return (await getApp())(req, res)
}

async function startServer() {
  const runtime = await getRuntime()
  const { app, db, config } = runtime
  const runCleanup = createCleanupRunner(db)
  const cleaner = setInterval(() => { void runCleanup() }, 60 * 1000).unref()
  const server = app.listen(config.port, () => {
    console.log(`E-Cell API listening on port ${config.port}`)
    if (!config.adminEmails.size) console.warn('ADMIN_EMAILS is empty: no protected owner can manage administrator access.')
    if (!config.emailUser || !config.emailPass) console.warn('Email credentials are missing: verification email delivery is disabled.')
    void runCleanup()
  })
  server.requestTimeout = 30000
  server.headersTimeout = 15000
  server.keepAliveTimeout = 5000
  let stopping = false
  function shutdown() {
    if (stopping) return
    stopping = true
    clearInterval(cleaner)
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1) }, 15000).unref()
    server.close(() => { clearTimeout(deadline); db.close().finally(() => process.exit(0)) })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

const entrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (entrypoint) startServer().catch((error) => {
  console.error(`E-Cell server failed to start: ${error.message}`)
  process.exitCode = 1
})
