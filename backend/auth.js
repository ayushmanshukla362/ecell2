import { randomInt, randomUUID } from 'node:crypto'
import { accessFor } from './access.js'
import { token, digest, codeDigest, equal, hashPassword, checkPassword, httpError, emailValue, passwordValue, nameValue, cookies, rateLimit } from './security.js'

const isToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
// Old login/Google/signup challenges must never authorize the new password-setup flow.
const codePurposes = new Map([['signup-v2', 'signup'], ['reset-v2', 'reset']])

export function installAuth(app, { db, config, sendCode, verifyGoogle, now = Date.now }) {
  const prefix = config.production ? '__Host-' : ''
  const cookieName = `${prefix}ecell-session`
  const nonceCookie = `${prefix}ecell-google`
  const setupCookie = `${prefix}ecell-setup`
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/' }
  const userView = async (user) => ({
    id: user.id, email: user.email, name: user.name,
    ...(await accessFor(db, config, user.email)),
    hasPassword: Boolean(user.password_hash), hasGoogle: Boolean(user.google_sub),
  })
  const limit = (key, count = 8, ms = 15 * 60 * 1000) => rateLimit(db, key, count, ms, now())
  const emailLimit = (email) => limit(`auth-email:${digest(email)}`, 10)
  const genericChallenge = (id) => ({ challengeId: id, expiresIn: config.codeMs / 1000, resendAfter: 60, message: 'If this email is eligible, a verification code has been sent. Check your inbox and spam folder. Already registered? Sign in or use password recovery.' })
  const findUser = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email)

  async function clearBrowserProofs(req) {
    const values = cookies(req)
    if (isToken(values[setupCookie])) await db.prepare('DELETE FROM auth_grants WHERE token_hash = ?').run(digest(values[setupCookie]))
    if (isToken(values[nonceCookie])) await db.prepare('DELETE FROM oauth_nonces WHERE hash = ?').run(digest(values[nonceCookie]))
  }
  // Call inside a transaction so account changes and session rotation succeed together.
  async function createSession(req, user) {
    if (req.session) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.session.token_hash)
    await clearBrowserProofs(req)
    const raw = token(), csrfToken = token()
    await db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(digest(raw), user.id, csrfToken, now() + config.sessionMs)
    return { raw, csrfToken, user: await userView(user) }
  }
  function sendSession(res, session) {
    res.cookie(cookieName, session.raw, { ...cookieOptions, maxAge: config.sessionMs })
    res.clearCookie(setupCookie, cookieOptions)
    res.clearCookie(nonceCookie, cookieOptions)
    return res.json({ user: session.user, csrfToken: session.csrfToken })
  }
  async function checkResetVersion(email, payload) {
    const user = await findUser(email)
    if (!user || user.id !== payload.userId || user.password_hash !== payload.passwordHash) throw httpError(400, 'Account details changed. Please request a new verification code.')
    return user
  }

  app.use('/api', async (req, res, next) => {
    const raw = cookies(req)[cookieName]
    if (isToken(raw)) {
      const session = await db.prepare(`SELECT sessions.token_hash,sessions.csrf,users.* FROM sessions
        JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?`).get(digest(raw), now())
      if (session) { req.session = session; req.user = await userView(session) }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.session && !equal(req.get('X-CSRF-Token'), req.session.csrf)) return next(httpError(403, 'Your security token expired. Refresh and try again.'))
    next()
  })

  app.get('/api/auth/session', (req, res) => res.json({ user: req.user || null, csrfToken: req.session?.csrf || null, googleClientId: config.googleClientId }))
  app.use('/api/auth', async (req, res, next) => {
    if (req.method !== 'GET') await limit(`auth-ip:${req.ip}`, 60)
    next()
  })

  async function challenge(email, purpose, payload) {
    const id = token(), code = String(randomInt(0, 1000000)).padStart(6, '0')
    const storedPurpose = `${purpose}-v2`
    await limit(`mail:${digest(email)}`, 1, 60 * 1000)
    await db.prepare('INSERT INTO challenges(id,email,purpose,code_hash,payload,expires_at,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, email, storedPurpose, codeDigest(config.secret, id, code), JSON.stringify(payload), now() + config.codeMs, now())
    try { await sendCode(email, code, purpose) }
    catch (error) {
      // Keep provider details out of the response, but leave a safe diagnostic
      // in the server log so SMTP configuration failures are actionable.
      console.error('Verification email delivery failed:', error?.code || error?.responseCode || error?.message || 'unknown mail error')
      await db.prepare('DELETE FROM challenges WHERE id = ?').run(id)
      throw httpError(503, 'Verification email could not be sent. Please try again later or contact the site administrator.')
    }
    await db.prepare('DELETE FROM challenges WHERE email = ? AND purpose = ? AND id != ? AND created_at <= ?').run(email, storedPurpose, id, now())
    return genericChallenge(id)
  }

  // Only ask for the email here. Passwords are accepted AFTER mailbox verification.
  app.post('/api/auth/signup', async (req, res) => {
    const email = emailValue(req.body.email)
    await emailLimit(email)
    if (await findUser(email)) return res.status(202).json(genericChallenge(token()))
    res.status(202).json(await challenge(email, 'signup', {}))
  })

  app.post('/api/auth/login', async (req, res) => {
    const email = emailValue(req.body.email), password = passwordValue(req.body.password)
    await emailLimit(email)
    const user = await findUser(email)
    if (!await checkPassword(password, user?.password_hash)) throw httpError(401, 'Email or password is incorrect. If you joined with Google, use Google sign-in or create a password through email verification.')
    const session = await db.transaction(async () => {
      // A password reset may have happened while the expensive hash was being checked.
      const current = await findUser(email)
      if (!current || current.id !== user.id || current.password_hash !== user.password_hash) throw httpError(401, 'Account details changed. Please sign in again.')
      return createSession(req, current)
    })
    sendSession(res, await session)
  })

  app.post('/api/auth/reset', async (req, res) => {
    const email = emailValue(req.body.email)
    await emailLimit(email)
    const user = await findUser(email)
    if (!user) return res.status(202).json(genericChallenge(token()))
    // This is also the safe way for a Google-only account to create a local password.
    res.status(202).json(await challenge(email, 'reset', { userId: user.id, passwordHash: user.password_hash }))
  })

  app.post('/api/auth/verify', async (req, res) => {
    const { challengeId, code } = req.body
    if (!isToken(challengeId) || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw httpError(400, 'Enter the six-digit verification code.')
    const result = await db.transaction(async () => {
      const row = await db.prepare('SELECT * FROM challenges WHERE id = ?').get(challengeId)
      if (!row || row.expires_at <= now() || row.attempts >= 5 || !codePurposes.has(row.purpose)) throw httpError(400, 'This code is invalid or expired. Start again to request a new code.')
      if (!equal(row.code_hash, codeDigest(config.secret, challengeId, code))) {
        await db.prepare('UPDATE challenges SET attempts = attempts + 1 WHERE id = ?').run(challengeId)
        // Return the failure so the increment commits rather than being rolled back.
        return { error: httpError(400, row.attempts >= 4 ? 'Too many incorrect codes. Start again to request a new code.' : 'Incorrect verification code. Please try again.') }
      }
      const purpose = codePurposes.get(row.purpose), payload = JSON.parse(row.payload)
      if (purpose === 'signup' && await findUser(row.email)) throw httpError(409, 'This account already exists. Please sign in or use password recovery.')
      if (purpose === 'reset') await checkResetVersion(row.email, payload)
      await db.prepare('DELETE FROM challenges WHERE id = ?').run(challengeId)
      const previous = cookies(req)[setupCookie]
      if (isToken(previous)) await db.prepare('DELETE FROM auth_grants WHERE token_hash = ?').run(digest(previous))
      await db.prepare('DELETE FROM auth_grants WHERE email = ? AND purpose = ?').run(row.email, purpose)
      const raw = token()
      await db.prepare('INSERT INTO auth_grants(token_hash,email,purpose,payload,expires_at) VALUES(?,?,?,?,?)')
        .run(digest(raw), row.email, purpose, JSON.stringify(payload), now() + config.codeMs)
      return { raw, purpose, email: row.email }
    })
    if (result.error) throw result.error
    // This cookie is only a short-lived, one-use capability to choose a password.
    // It is NOT an authenticated session and never grants admin access.
    res.cookie(setupCookie, result.raw, { ...cookieOptions, maxAge: config.codeMs })
    res.json({ verified: true, purpose: result.purpose, email: result.email, expiresIn: config.codeMs / 1000 })
  })

  app.post('/api/auth/complete', async (req, res) => {
    const raw = cookies(req)[setupCookie]
    const readGrant = () => isToken(raw) ? db.prepare('SELECT * FROM auth_grants WHERE token_hash = ? AND expires_at > ?').get(digest(raw), now()) : null
    const grant = await readGrant()
    if (!grant) throw httpError(401, 'Email verification expired or was already used. Please verify your email again.')
    const name = grant.purpose === 'signup' ? nameValue(req.body.name) : null
    const passwordHash = await hashPassword(passwordValue(req.body.password, true))
    const session = await db.transaction(async () => {
      // Re-read after hashing: concurrent completion must not reuse a consumed proof.
      const current = await readGrant()
      if (!current) throw httpError(401, 'Email verification expired or was already used. Please verify your email again.')
      const payload = JSON.parse(current.payload)
      if (current.purpose === 'signup') {
        if (await findUser(current.email)) throw httpError(409, 'This account already exists. Please sign in or use password recovery.')
        await db.prepare('INSERT INTO users(id,email,name,password_hash,verified_at) VALUES(?,?,?,?,?)').run(randomUUID(), current.email, name, passwordHash, now())
      } else if (current.purpose === 'reset') {
        const user = await checkResetVersion(current.email, payload)
        await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id)
        await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
      } else throw httpError(400, 'Invalid password setup request.')
      await db.prepare('DELETE FROM challenges WHERE email = ?').run(current.email)
      await db.prepare('DELETE FROM auth_grants WHERE email = ?').run(current.email)
      return createSession(req, await findUser(current.email))
    })
    sendSession(res, await session)
  })

  app.post('/api/auth/google/nonce', async (req, res) => {
    if (!config.googleClientId) throw httpError(503, 'Google sign-in is not configured.')
    const previous = cookies(req)[nonceCookie]
    if (isToken(previous)) await db.prepare('DELETE FROM oauth_nonces WHERE hash = ?').run(digest(previous))
    const nonce = token()
    await db.prepare('INSERT INTO oauth_nonces(hash,expires_at) VALUES(?,?)').run(digest(nonce), now() + config.codeMs)
    res.cookie(nonceCookie, nonce, { ...cookieOptions, maxAge: config.codeMs })
    res.json({ nonce })
  })

  app.post('/api/auth/google', async (req, res) => {
    if (!config.googleClientId) throw httpError(503, 'Google sign-in is not configured.')
    if (typeof req.body.credential !== 'string' || !req.body.credential || req.body.credential.length > 10000) throw httpError(400, 'Invalid Google credential.')
    let identity
    // Production adapter verifies Google's signature, issuer, audience and expiration.
    try { identity = await verifyGoogle(req.body.credential) } catch { throw httpError(401, 'Google could not verify this sign-in. Please try again.') }
    const nonce = cookies(req)[nonceCookie]
    if (!identity || !isToken(nonce) || !equal(identity.nonce, nonce)) throw httpError(401, 'Google sign-in expired. Please try again.')
    if (identity.email_verified !== true || typeof identity.sub !== 'string' || !identity.sub || identity.sub.length > 255) throw httpError(401, 'Use a verified Google email address.')
    const email = emailValue(identity.email)
    // Google is only authoritative for Gmail / verified Workspace mailboxes.
    // A third-party Google email_verified claim may be stale after mailbox reassignment.
    if (!email.endsWith('@gmail.com') && !(typeof identity.hd === 'string' && identity.hd.trim())) throw httpError(403, 'Use a Gmail or Google Workspace account for Google sign-in. For other email addresses, use email signup or sign-in.')
    await emailLimit(email)
    const session = await db.transaction(async () => {
      if (!await db.prepare('DELETE FROM oauth_nonces WHERE hash = ? AND expires_at > ? RETURNING hash').get(digest(nonce), now())) throw httpError(401, 'Google sign-in expired. Please try again.')
      const linked = await db.prepare('SELECT * FROM users WHERE google_sub = ?').get(identity.sub)
      const byEmail = await findUser(email)
      if ((linked && linked.email !== email) || (byEmail?.google_sub && byEmail.google_sub !== identity.sub)) throw httpError(409, 'This Google identity cannot be linked. Use email sign-in or contact support.')
      if (byEmail) {
        // Link only the provider subject; never overwrite a local password or profile.
        if (!byEmail.google_sub) await db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(identity.sub, byEmail.id)
      } else {
        const name = (typeof identity.name === 'string' ? identity.name.trim() : '') || email.split('@')[0]
        await db.prepare('INSERT INTO users(id,email,name,google_sub,verified_at) VALUES(?,?,?,?,?)').run(randomUUID(), email, name.slice(0, 120), identity.sub, now())
      }
      return createSession(req, await findUser(email))
    })
    // Google already authenticated the user: no local password, code or SMTP call.
    sendSession(res, await session)
  })

  app.post('/api/auth/logout', async (req, res) => {
    await db.transaction(async () => {
      if (req.session) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.session.token_hash)
      await clearBrowserProofs(req)
    })
    for (const name of [cookieName, setupCookie, nonceCookie]) res.clearCookie(name, cookieOptions)
    res.status(204).end()
  })
  return function requireAdmin(req, res, next) {
    if (!req.user) return next(httpError(401, 'Please sign in first.'))
    // Always query current grants; revocation applies to existing sessions immediately.
    return Promise.resolve(accessFor(db, config, req.user.email)).then((access) => access.isAdmin ? next() : next(httpError(403, 'This account is not authorized to manage the website.'))).catch(next)
  }
}
