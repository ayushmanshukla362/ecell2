import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { googleVerifier } from '../google.js'

// Real JWT signature/claim verification, but with ephemeral local keys instead of
// a network request to Google. These keys never authorize the production server.
const trusted = generateKeyPairSync('rsa', { modulusLength: 2048 })
const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 })
const clientId = 'test-web-client.apps.googleusercontent.com'
const client = new OAuth2Client(clientId)
client.getFederatedSignonCertsAsync = async () => ({ certs: { 'local-test-key': trusted.publicKey.export({ type: 'spki', format: 'pem' }) } })
const verify = googleVerifier(clientId, client)

function signedToken(patch = {}, key = trusted.privateKey, headerPatch = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'local-test-key', ...headerPatch })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: clientId, iat: now - 10, exp: now + 3600, sub: 'test-google-sub', email: 'person@gmail.com', email_verified: true, nonce: 'browser-bound-test-nonce', ...patch })).toString('base64url')
  const message = `${header}.${payload}`
  return `${message}.${sign('RSA-SHA256', Buffer.from(message), key).toString('base64url')}`
}

test('Google adapter verifies signatures and accepts only the configured audience and issuer', async () => {
  const identity = await verify(signedToken())
  assert.equal(identity.sub, 'test-google-sub')
  assert.equal(identity.nonce, 'browser-bound-test-nonce')
  await assert.rejects(verify(signedToken({}, attacker.privateKey)))
  await assert.rejects(verify(signedToken({ aud: 'another-app.apps.googleusercontent.com' })))
  await assert.rejects(verify(signedToken({ iss: 'https://attacker.example' })))
  await assert.rejects(verify(signedToken({}, trusted.privateKey, { kid: 'unknown-key' })))
  await assert.rejects(googleVerifier('', client)(signedToken()), /not configured/)
})

test('Google adapter rejects expired, future and malformed signed credentials', async () => {
  const now = Math.floor(Date.now() / 1000)
  // Google's library allows five minutes of clock skew, so test outside that window.
  await assert.rejects(verify(signedToken({ iat: now - 7200, exp: now - 3600 })))
  await assert.rejects(verify(signedToken({ iat: now + 3600, exp: now + 7200 })))
  await assert.rejects(verify(signedToken({ exp: undefined })))
  await assert.rejects(verify('not.a.valid-token'))
  const valid = signedToken()
  const [header, encoded, signature] = valid.split('.')
  const tampered = JSON.parse(Buffer.from(encoded, 'base64url').toString())
  tampered.email = 'admin@example.com'
  await assert.rejects(verify(`${header}.${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${signature}`))
})
