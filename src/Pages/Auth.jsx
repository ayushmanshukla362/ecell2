import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import GoogleButton from '../auth/GoogleButton'
import '../auth.css'

const secondsLeft = (deadline, now) => Math.max(0, Math.ceil((deadline - now) / 1000))
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export default function Auth() {
  const { user, loading, googleClientId, acceptSession, refresh, error: sessionError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const mode = location.pathname === '/signup' ? 'signup' : location.pathname === '/reset-password' ? 'reset' : 'login'
  const [form, setForm] = useState(() => ({ name: '', email: location.state?.email || (mode === 'reset' ? user?.email : '') || '', password: '', confirmPassword: '' }))
  const [stage, setStage] = useState('email')
  const [challenge, setChallenge] = useState(null)
  const [proof, setProof] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  const emailEdited = useRef(false)
  const from = location.state?.from === '/admin' ? '/admin' : null
  const locked = busy || googleBusy
  const expiresIn = secondsLeft(stage === 'details' ? proof?.expiresAt : challenge?.expiresAt, now)
  const resendIn = challenge ? secondsLeft(challenge.resendAt, now) : 0
  const expired = (stage === 'code' || stage === 'details') && expiresIn === 0
  const step = stage === 'email' ? 1 : stage === 'details' ? 3 : 2
  const steps = mode === 'login' ? ['Email', 'Password'] : ['Email', 'Verify', 'Finish']
  const creatingPassword = mode === 'reset' && user?.hasPassword === false

  useEffect(() => {
    if (mode === 'reset' && user?.email && !emailEdited.current && !location.state?.email) {
      setForm((current) => ({ ...current, email: user.email }))
    }
  }, [mode, user?.email, location.state?.email])
  useEffect(() => {
    if (!challenge) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [challenge])

  if (loading) return <main className="auth-page site-section"><p role="status">Checking your session…</p></main>
  if (user && mode !== 'reset') return <Navigate to={from || (user.isAdmin ? '/admin' : '/account')} replace />

  const change = (event) => {
    if (event.target.name === 'email') emailEdited.current = true
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }
  const signedIn = (result) => {
    acceptSession(result)
    navigate(from || (mode === 'reset' ? '/account' : result.user.isAdmin ? '/admin' : '/account'), { replace: true })
  }
  async function requestCode() {
    const email = form.email.trim().toLowerCase()
    const result = await api(`/api/auth/${mode}`, { method: 'POST', body: { email } })
    const time = Date.now()
    setNow(time)
    setForm((current) => ({ ...current, email, password: '', confirmPassword: '' }))
    setChallenge({ ...result, expiresAt: time + result.expiresIn * 1000, resendAt: time + result.resendAfter * 1000 })
    setCode(''); setProof(null); setStage('code')
  }
  async function submit(event) {
    event.preventDefault()
    if (locked || expired) return
    setError('')
    if (stage === 'email' && mode === 'login') {
      setForm((current) => ({ ...current, email: current.email.trim().toLowerCase() }))
      setStage('password') // Deliberately local: no account-discovery request.
      return
    }
    if (stage === 'details') {
      if (form.password.length < 12 || new TextEncoder().encode(form.password).length > 256) {
        setError('Use at least 12 characters and no more than 256 bytes for your password. Non-English characters can use more than one byte.')
        return
      }
      if (form.password !== form.confirmPassword) { setError('Your passwords do not match. Please enter the same password twice.'); return }
    }
    setBusy(true)
    try {
      if (stage === 'email') await requestCode()
      else if (stage === 'password') signedIn(await api('/api/auth/login', { method: 'POST', body: { email: form.email, password: form.password } }))
      else if (stage === 'code') {
        const result = await api('/api/auth/verify', { method: 'POST', body: { challengeId: challenge.challengeId, code } })
        if (!result.verified || result.purpose !== mode) throw new Error('This code belongs to a different request. Please start again.')
        const time = Date.now()
        setNow(time); setProof({ email: result.email, expiresAt: time + result.expiresIn * 1000 }); setCode(''); setStage('details')
      } else {
        signedIn(await api('/api/auth/complete', { method: 'POST', body: { ...(mode === 'signup' ? { name: form.name.trim() } : {}), password: form.password } }))
      }
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  async function resend() {
    if (locked || resendIn > 0) return
    setError(''); setBusy(true)
    try { await requestCode() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  function back() {
    setStage('email'); setCode(''); setProof(null); setError('')
    setForm((current) => ({ ...current, password: '', confirmPassword: '' }))
    // Keep the existing cooldown when returning to the same email step.
  }

  const title = stage === 'code' ? 'Verify your email' : stage === 'details' ? mode === 'signup' ? 'Make it yours' : 'Choose a new password' : stage === 'password' ? 'Enter your password' : mode === 'signup' ? 'Create an account' : mode === 'reset' ? creatingPassword ? 'Create a password' : 'Reset your password' : 'Sign in'
  const action = stage === 'email' ? mode === 'login' ? 'Continue with email' : 'Send verification code' : stage === 'password' ? 'Sign in' : stage === 'code' ? 'Verify and continue' : mode === 'signup' ? 'Create account' : 'Save password and sign in'

  return <main className="auth-page site-section">
    <section className="auth-intro">
      <p className="eyebrow"><span>E-Cell</span> / Your next step</p>
      <h1>{stage === 'code' ? <>Check your<br /><em>inbox.</em></> : mode === 'signup' ? <>A place for<br /><em>your ideas.</em></> : mode === 'reset' ? <>A fresh<br /><em>start.</em></> : <>Welcome<br /><em>back.</em></>}</h1>
      <p>{mode === 'signup' ? 'Start with your email. Verify it, then choose your name and password. Or join directly with Google.' : mode === 'reset' ? 'Verify your email to reset your password or create one for an account you opened with Google.' : 'Your email and password, or your Google account. Two simple ways to pick up where you left off.'}</p>
      <div className="auth-security"><ShieldCheck size={22} aria-hidden="true" /><span>Verified accounts. Private sessions.<br />Admin access for authorized emails only.</span></div>
    </section>
    <section className="auth-card" aria-labelledby="auth-title">
      <ol className="auth-progress" aria-label="Authentication progress">{steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined} className={step > index + 1 ? 'is-complete' : ''}><span aria-hidden="true">0{index + 1}</span>{label}</li>)}</ol>
      <h2 id="auth-title">{title}</h2>
      {sessionError && <div className="auth-error" role="alert"><p>{sessionError}</p><button className="auth-text-button" type="button" disabled={locked} onClick={() => refresh().catch(() => {})}>Reconnect to the server</button></div>}
      {stage !== 'email' && <div className="auth-email-summary"><span>{proof?.email || form.email}</span><button type="button" className="auth-text-button" disabled={locked} onClick={back}><ArrowLeft size={14} aria-hidden="true" /> {stage === 'details' ? 'Start again' : 'Change email'}</button></div>}
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={locked}>
          {stage === 'email' && <>
            <p className="auth-hint">{mode === 'login' ? 'Continue to enter your password. Google sign-in is available below.' : mode === 'signup' ? 'We’ll verify your email before you set up your account.' : 'We’ll send a code if this email is eligible. Google-only accounts can use this same flow to add a password.'}</p>
            <label htmlFor="auth-email">Email address</label>
            <input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={change} placeholder="you@gmail.com" />
          </>}
          {stage === 'code' && <>
            <p className="auth-hint" role="status">{challenge.message}</p>
            <label htmlFor="auth-code">Verification code</label>
            <input id="auth-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus aria-describedby="code-help" />
            <p id="code-help" className="auth-hint">Six digits. Only the latest code works. {expired ? 'This code has expired. Request a new one below.' : `Code expires in ${clock(expiresIn)}.`}</p>
          </>}
          {stage === 'details' && <>
            <p className="auth-verified"><ShieldCheck size={17} aria-hidden="true" /> Email verified — one last step.</p>
            {mode === 'signup' && <><label htmlFor="auth-name">Your name</label><input id="auth-name" name="name" autoComplete="name" required minLength={2} maxLength={120} value={form.name} onChange={change} autoFocus /></>}
          </>}
          {(stage === 'password' || stage === 'details') && <>
            <input type="hidden" name="email" autoComplete="username" value={proof?.email || form.email} />
            <label htmlFor="auth-password">{stage === 'password' ? 'Password' : 'New password'}</label>
            <input id="auth-password" name="password" type="password" autoComplete={stage === 'password' ? 'current-password' : 'new-password'} required minLength={stage === 'password' ? 1 : 12} maxLength={256} value={form.password} onChange={change} aria-describedby="password-help" autoFocus={stage === 'password' || mode === 'reset'} />
            <p id="password-help" className="auth-hint">{stage === 'password' ? 'Sign in directly with your password — no email code needed.' : 'Use a unique passphrase of at least 12 characters (maximum 256 bytes; some characters use multiple bytes).'}</p>
            {stage === 'details' && <>
              <label htmlFor="auth-confirm-password">Confirm new password</label>
              <input id="auth-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={form.confirmPassword} onChange={change} />
              <p className="auth-hint">{expired ? 'Your verified setup has expired. Request a new code below.' : `Finish within ${clock(expiresIn)}. ${mode === 'reset' ? 'Saving signs out your other sessions.' : 'Your account is created only when you finish.'}`}</p>
            </>}
          </>}
          <button className="auth-button" type="submit" disabled={expired || (stage === 'email' && mode !== 'login' && resendIn > 0)}>{busy ? 'Please wait…' : googleBusy ? 'Continue with Google…' : stage === 'email' && mode !== 'login' && resendIn > 0 ? `Send a new code in ${resendIn}s` : action} {!locked && <ArrowUpRight size={18} aria-hidden="true" />}</button>
        </fieldset>
        {error && <p role="alert" className="auth-error">{error}</p>}
      </form>
      {(stage === 'code' || stage === 'details') && <div className="auth-code-actions">
        <p className="auth-hint">{stage === 'code' ? 'No email? Check spam and the address above. Already registered? Use sign-in instead of signup.' : 'Need more time? Verify a fresh code to start this step again.'}</p>
        <button type="button" className="auth-text-button" disabled={locked || resendIn > 0} onClick={resend}>{resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend verification code'}</button>
      </div>}
      {stage === 'email' && mode !== 'reset' && <><div className="auth-divider">or continue directly with Google</div><GoogleButton clientId={googleClientId} onSuccess={signedIn} onBusyChange={setGoogleBusy} disabled={busy} /></>}
      <div className="auth-switch">
        {mode === 'login' ? <>
          <p>New here? <Link to="/signup" state={{ ...location.state, email: form.email }}>Create an account ↗</Link></p>
          <Link to="/reset-password" state={{ ...location.state, email: form.email }}>Forgot or need to create a password?</Link>
          {stage === 'password' && <p className="auth-hint">Joined with Google? Use Google sign-in, or verify your email above to create an optional password.</p>}
        </> : <p>{user ? <Link to="/account">Back to your account ↗</Link> : <>Already have an account? <Link to="/signin" state={{ ...location.state, email: form.email }}>Sign in ↗</Link></>}</p>}
      </div>
    </section>
  </main>
}
