import { OAuth2Client } from 'google-auth-library'

// Only Google's verification library may convert a browser credential into an identity.
// The optional client lets tests supply local signing keys without bypassing verification.
export function googleVerifier(clientId, client = new OAuth2Client(clientId)) {
  return async (credential) => {
    if (!clientId) throw new Error('Google sign-in is not configured.')
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
    return ticket.getPayload()
  }
}
