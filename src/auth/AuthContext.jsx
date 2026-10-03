import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from '../lib/api'

/* eslint-disable react/prop-types, react-refresh/only-export-components */
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, loading: true, error: '', googleClientId: '' })
  const revision = useRef(0)
  const refresh = useCallback(async () => {
    const requestRevision = ++revision.current
    try {
      const result = await api('/api/auth/session')
      if (requestRevision === revision.current) setState({ user: result.user, googleClientId: result.googleClientId, loading: false, error: '' })
      return result.user
    } catch (error) {
      if (requestRevision === revision.current) setState((current) => ({ ...current, loading: false, error: error.message }))
      throw error
    }
  }, [])
  const acceptSession = useCallback((result) => {
    // An older focus refresh must not overwrite a session we just established.
    revision.current += 1
    setState((current) => ({ ...current, user: result.user, loading: false, error: '' }))
  }, [])
  useEffect(() => {
    const refreshQuietly = () => { refresh().catch(() => {}) }
    refreshQuietly()
    window.addEventListener('ecell:session-expired', refreshQuietly)
    window.addEventListener('focus', refreshQuietly)
    return () => { window.removeEventListener('ecell:session-expired', refreshQuietly); window.removeEventListener('focus', refreshQuietly) }
  }, [refresh])
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' })
    revision.current += 1
    setState((current) => ({ ...current, user: null, error: '' }))
  }
  return <AuthContext.Provider value={{ ...state, refresh, acceptSession, logout }}>{children}</AuthContext.Provider>
}
export function useAuth() { return useContext(AuthContext) }

export function AdminRoute({ children }) {
  const { user, loading, error, refresh } = useAuth()
  const location = useLocation()
  if (loading) return <main className="auth-page"><p role="status">Checking your access…</p></main>
  if (error) return <main className="auth-page"><h1>Unable to check access</h1><p role="alert">{error}</p><button className="auth-button" onClick={() => refresh().catch(() => {})}>Try again</button></main>
  if (!user) return <Navigate to="/signin" state={{ from: location.pathname }} replace />
  if (!user.isAdmin) return <main className="auth-page"><p className="eyebrow">Restricted access</p><h1>For the authorized team.</h1><p>Your account is verified, but it is not on the administrator allowlist. Ask the site owner to authorize your email address.</p><a className="text-link" href="/account">Back to your account ↗</a></main>
  return children
}
