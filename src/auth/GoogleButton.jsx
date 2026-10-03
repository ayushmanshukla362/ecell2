import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

/* eslint-disable react/prop-types */
let scriptPromise
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    const fail = () => { script.remove(); scriptPromise = null; reject(new Error('The Google provider could not load. Check your connection or use email instead.')) }
    script.onload = () => { if (window.google?.accounts?.id) resolve(); else fail() }
    script.onerror = fail
    document.head.appendChild(script)
  })
  return scriptPromise
}

export default function GoogleButton({ clientId, onSuccess, onBusyChange, disabled }) {
  const container = useRef(null)
  const callbacks = useRef({ onSuccess, onBusyChange })
  callbacks.current = { onSuccess, onBusyChange }
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState('loading')
  const busy = phase === 'provider' || phase === 'session'
  useEffect(() => {
    let active = true
    let submitting = false
    if (!clientId || disabled) return
    setError(''); setPhase('loading')
    loadGoogle().then(async () => {
      if (!active) return
      const { nonce } = await api('/api/auth/google/nonce', { method: 'POST' })
      if (!active || !container.current) return
      window.google.accounts.id.initialize({
        client_id: clientId, nonce, auto_select: false,
        callback: async ({ credential }) => {
          if (!active || submitting) return
          submitting = true
          setError(''); setPhase('session'); callbacks.current.onBusyChange?.(true)
          try {
            if (!credential) throw new Error('Google did not return a credential. Please try again.')
            const result = await api('/api/auth/google', { method: 'POST', body: { credential } })
            if (active) callbacks.current.onSuccess(result)
          } catch (err) { if (active) { setError(`Google sign-in failed. ${err.message}`); setPhase('error') } }
          finally { if (active) { submitting = false; callbacks.current.onBusyChange?.(false) } }
        },
      })
      container.current.replaceChildren()
      window.google.accounts.id.renderButton(container.current, {
        theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular',
        width: Math.min(container.current.clientWidth || 280, 360),
        click_listener: () => {
          if (!active) return
          setPhase('provider'); callbacks.current.onBusyChange?.(true)
        },
      })
      setPhase('ready')
    }).catch((err) => { if (active) { setError(`Google sign-in is unavailable. ${err.message}`); setPhase('error') } })
    return () => { active = false; callbacks.current.onBusyChange?.(false) }
  }, [clientId, attempt, disabled])
  if (!clientId) return <p className="auth-hint">Google sign-in is not configured on this site. Please continue with email.</p>
  return <div className="google-signin" aria-busy={busy}>
    <div ref={container} hidden={disabled || phase !== 'ready'} />
    {!disabled && phase === 'loading' && <p className="auth-hint" role="status">Loading Google sign-in…</p>}
    {busy && <p className="auth-hint" role="status">{phase === 'provider' ? 'Finish signing in in the Google window. No email code is needed.' : 'Signing you in securely with Google…'}</p>}
    {phase === 'provider' && <button className="auth-text-button" type="button" onClick={() => { callbacks.current.onBusyChange?.(false); setAttempt((value) => value + 1) }}>Closed the Google window? Return to email</button>}
    {error && <><p role="alert" className="auth-error">{error}</p><button className="auth-text-button" type="button" disabled={disabled || busy} onClick={() => setAttempt((value) => value + 1)}>Retry Google sign-in</button></>}
  </div>
}
