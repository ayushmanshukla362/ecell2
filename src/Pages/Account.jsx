import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import '../auth.css'

export default function Account() {
  const { user, loading, error: sessionError, logout, refresh } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (loading) return <main className="auth-page site-section"><p role="status">Checking your session…</p></main>
  if (sessionError) return <main className="auth-page site-section"><p role="alert">{sessionError}</p><button className="auth-button" onClick={() => refresh().catch(() => {})}>Try again</button></main>
  if (!user) return <Navigate to="/signin" replace />
  async function signOut() {
    setBusy(true); setError('')
    try { await logout() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <main className="auth-page site-section">
    <section className="auth-intro"><p className="eyebrow"><span>Your account</span> / Email verified</p><h1>Hello,<br /><em>{user.name}.</em></h1><p>You’re signed in securely. Discover the people and ideas making things happen at E-Cell.</p></section>
    <section className="auth-card" aria-labelledby="account-title">
      <h2 id="account-title">Good to have you here.</h2>
      <p className="account-email">{user.email}</p>
      <p className="auth-hint">{user.isAdmin ? 'Your email is authorized to manage website content.' : 'Your account does not have administrator access.'}</p>
      <div className="account-methods">
        <h3>Sign-in methods</h3>
        <dl>
          <div><dt>Email and password</dt><dd>{user.hasPassword ? 'Password set' : 'Not set up'}</dd></div>
          <div><dt>Google</dt><dd>{user.hasGoogle ? 'Linked' : 'Not linked'}</dd></div>
        </dl>
        <p className="auth-hint">{user.hasPassword ? 'Verify your email before changing your password. Your other sessions will be signed out.' : 'Google sign-in needs no local password. Add an optional password by verifying your email.'}</p>
        <Link className="auth-text-button" to="/reset-password" state={{ email: user.email }}>{user.hasPassword ? 'Reset password' : 'Create a password'} ↗</Link>
      </div>
      <div className="account-actions">
        {user.isAdmin && <Link className="auth-button" to="/admin">Open admin panel ↗</Link>}
        <Link className="text-link" to="/events">Explore our events ↗</Link>
        <button className="auth-text-button" type="button" disabled={busy} onClick={signOut}>{busy ? 'Signing out…' : 'Sign out'}</button>
      </div>
      {error && <p role="alert" className="auth-error">{error}</p>}
    </section>
  </main>
}
