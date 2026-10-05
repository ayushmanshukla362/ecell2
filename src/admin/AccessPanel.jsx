/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import UserPicker from './UserPicker'

export default function AccessPanel({ user, onBusyChange }) {
  const [admins, setAdmins] = useState([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState([])
  const [directoryRevision, setDirectoryRevision] = useState(0)
  const request = useRef(0)
  const lock = useRef(false)
  const input = useRef(null)
  const load = useCallback(async () => {
    const current = ++request.current
    setLoading(true)
    setLoadError('')
    try {
      const result = await api('/api/admin/access')
      if (!Array.isArray(result?.admins) || !result.canManage) throw new Error('Owner permission is required to manage administrators.')
      if (request.current === current) setAdmins(result.admins)
    } catch (problem) { if (request.current === current) setLoadError(problem.message || 'Administrators could not be loaded.') }
    finally { if (request.current === current) setLoading(false) }
  }, [])
  useEffect(() => { load(); return () => { request.current += 1 } }, [load])
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
  const add = async (event) => {
    event.preventDefault()
    if (lock.current || loading || loadError) return
    const normalized = email.trim().toLowerCase()
    setError('')
    setNotice('')
    const issue = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254 ? 'Enter a valid email address.' : admins.some((admin) => admin.email.toLowerCase() === normalized) ? 'This email already has administrator access.' : ''
    setEmailError(issue)
    if (issue) { input.current?.focus(); return }
    lock.current = true
    setBusy(true)
    try {
      const result = await api('/api/admin/access', { method: 'POST', body: { email: normalized } })
      if (!result?.admin?.email) throw new Error('The server did not return the administrator. Reload the list before retrying.')
      setAdmins((current) => [...current, result.admin])
      setEmail('')
      setDirectoryRevision((value) => value + 1)
      setNotice(`Authorized ${normalized}. No invitation email was sent. They must sign up or sign in using this exact email address.`)
    } catch (problem) { setError(problem.message || 'Access could not be granted. Please try again.') }
    finally { lock.current = false; setBusy(false) }
  }
  const addSelected = async () => {
    if (lock.current || loading || loadError || !selected.length) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api('/api/admin/access/bulk', { method: 'POST', body: { userIds: selected.map((entry) => entry.id) } })
      if (!Array.isArray(result?.admins) || !Array.isArray(result.skipped)) throw new Error('The server response was incomplete. Reload administrators before retrying.')
      setAdmins((current) => [...current, ...result.admins.filter((admin) => !current.some((entry) => entry.email === admin.email))])
      setSelected([])
      setDirectoryRevision((value) => value + 1)
      setNotice(`Administrator access granted to ${result.admins.length} ${result.admins.length === 1 ? 'user' : 'users'}.${result.skipped.length ? ` ${result.skipped.length} already authorized users were skipped.` : ''} Access is available immediately when they sign in.`)
    } catch (problem) { setError(problem.message || 'Access could not be granted. Please try again.') }
    finally { lock.current = false; setBusy(false) }
  }
  const revoke = async (admin) => {
    if (lock.current || admin.role === 'owner' || admin.source === 'environment' || admin.email === user.email || !window.confirm(`Revoke administrator access for ${admin.email}? Access ends immediately. Their personal account and published content will not be deleted.`)) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/access/${encodeURIComponent(admin.email)}`, { method: 'DELETE' })
      setAdmins((current) => current.filter((entry) => entry.email !== admin.email))
      setDirectoryRevision((value) => value + 1)
      setNotice(`Administrator access revoked for ${admin.email}. Their personal account and content are unchanged.`)
    } catch (problem) { setError(problem.message || 'Access could not be revoked. Please try again.') }
    finally { lock.current = false; setBusy(false) }
  }

  return <section className="admin-access" aria-labelledby="access-title" aria-busy={busy}>
    <header className="admin-panel-heading"><div><h2 id="access-title">Administrator access</h2><p>Only site owners can authorize administrators. Owners are protected by server configuration and cannot be added, removed or demoted here.</p></div><button className="admin-button" type="button" disabled={busy || loading} onClick={load}>Reload administrators</button></header>
    <p className="admin-editor__note">Authorize an email before or after signup. No invitation email is sent: the person must sign up or sign in using the exact authorized email. Revoking access takes effect immediately without deleting their personal account or any content.</p>
    {loading && <p className="admin-alert" role="status">Loading administrators…</p>}
    {loadError && <div className="admin-alert admin-alert--error" role="alert"><p>{loadError}</p><button className="admin-button" type="button" disabled={busy || loading} onClick={load}>Retry loading administrators</button></div>}
    <div className="admin-access-bulk">
      <UserPicker id="access-users" selected={selected} onChange={setSelected} disabled={busy || loading || Boolean(loadError)} reloadKey={directoryRevision} unavailable={(entry) => entry.isAdmin || admins.some((admin) => admin.email === entry.email) ? 'Already authorized' : ''} />
      <div className="admin-bulk-review"><div><strong>Authorize selected users</strong><span>{selected.length} selected · Content and media management access</span></div><button className="admin-button admin-button--primary" type="button" disabled={busy || loading || Boolean(loadError) || !selected.length} onClick={addSelected}>{busy ? 'Updating access…' : `Authorize ${selected.length || 'selected'} ${selected.length === 1 ? 'user' : 'users'}`}</button></div>
    </div>
    {error && <p className="admin-alert admin-alert--error" role="alert">{error}</p>}
    {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}
    <h3 className="admin-form-heading">Authorize by exact email</h3>
    <p className="admin-access-note">For someone who has not registered yet, authorize their full email address below.</p>
    <form className="admin-access-form" onSubmit={add} noValidate>
      <div className="admin-field"><label htmlFor="admin-access-email">Administrator email address</label><input ref={input} id="admin-access-email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setEmailError('') }} disabled={busy || loading || Boolean(loadError)} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? 'admin-access-email-error' : undefined} />{emailError && <p id="admin-access-email-error" className="admin-field__error" role="alert">{emailError}</p>}</div>
      <button className="admin-button admin-button--primary" type="submit" disabled={busy || loading || Boolean(loadError)}>{busy ? 'Updating access…' : 'Authorize administrator'}</button>
    </form>
    <h3 className="admin-form-heading">Current administrators <span className="admin-count">({admins.length})</span></h3>
    <ul className="admin-access-list">{admins.map((admin) => {
      const protectedOwner = admin.role === 'owner' || admin.source === 'environment'
      return <li key={admin.email}><div><h3>{admin.email}</h3><p>{admin.name || (admin.joined ? 'Registered account' : 'Not yet signed up')} · {protectedOwner ? 'Owner · protected configuration' : 'Content administrator'}</p></div>{protectedOwner ? <span className="admin-badge">Protected owner</span> : admin.email === user.email ? <span className="admin-badge">Your account</span> : <button className="admin-button admin-button--danger" type="button" disabled={busy || loading || Boolean(loadError)} onClick={() => revoke(admin)} aria-label={`Revoke access for ${admin.email}`}>Revoke access</button>}</li>
    })}</ul>
  </section>
}
