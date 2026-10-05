/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import UserPicker from './UserPicker'
import { contentFormValues, contentPayload, validateContentForm } from '../content/contentForms'
import { MEMBER_GROUPS } from '../content/contentUtils'

const groupLabels = { executives: 'Executives', mentors: 'Mentors', alumni: 'Alumni', volunteers: 'Volunteers' }

export default function BulkMemberEditor({ batch, group, batches, busy, onSave, onCancel }) {
  const [values, setValues] = useState(() => contentFormValues('members', { ...(batch !== 'all' ? { batch } : {}), ...(group !== 'all' ? { group } : {}) }))
  const [selected, setSelected] = useState([])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const form = useRef(null)
  useEffect(() => { form.current?.querySelector('input')?.focus() }, [])
  const change = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    if (name === 'batch') setSelected((current) => current.filter((user) => !user.batches.includes(value)))
  }
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    const issues = validateContentForm('members', { ...values, name: 'Registered member' })
    if (!selected.length) issues.users = 'Select at least one user to add to this team.'
    setErrors(issues)
    setError('')
    if (Object.keys(issues).length) { form.current?.querySelector(`[aria-invalid="true"]`)?.focus(); return }
    try { await onSave({ ...contentPayload('members', { ...values, name: 'Registered member' }), userIds: selected.map((user) => user.id) }) }
    catch (problem) { setError(problem.message || 'Team members could not be added. Please try again.') }
  }
  return <section className="admin-editor" aria-labelledby="bulk-member-title">
    <header><div><p className="eyebrow">Team management</p><h2 id="bulk-member-title">Add users to team</h2></div><button type="button" className="admin-icon-button" aria-label="Close user editor" disabled={busy} onClick={onCancel}><X size={22} /></button></header>
    <p className="admin-editor__note">Choose a destination batch and group, then select registered users. Each user gets a public member profile using their account name. You can edit individual roles and portraits after adding them.</p>
    <form ref={form} onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset disabled={busy}><legend className="sr-only">Team assignment</legend><div className="admin-form-grid">
        <div className="admin-field"><label htmlFor="bulk-member-batch">Destination batch *</label><input id="bulk-member-batch" required value={values.batch} maxLength={9} list="bulk-member-batches" placeholder="2025-2026" aria-invalid={Boolean(errors.batch)} aria-describedby="bulk-member-batch-hint" onChange={(event) => change('batch', event.target.value)} /><datalist id="bulk-member-batches">{batches.map((value) => <option key={value} value={value} />)}</datalist><small id="bulk-member-batch-hint">Two consecutive years, e.g. 2025-2026.</small>{errors.batch && <p className="admin-field__error" role="alert">{errors.batch}</p>}</div>
        <div className="admin-field"><label htmlFor="bulk-member-group">Member group *</label><select id="bulk-member-group" value={values.group} onChange={(event) => change('group', event.target.value)}>{MEMBER_GROUPS.map((value) => <option key={value} value={value}>{groupLabels[value]}</option>)}</select></div>
        <div className="admin-field"><label htmlFor="bulk-member-role">Shared role / department</label><input id="bulk-member-role" value={values.role} maxLength={160} onChange={(event) => change('role', event.target.value)} /><small>Optional. Applied to every selected user.</small>{errors.role && <p className="admin-field__error" role="alert">{errors.role}</p>}</div>
        <div className="admin-field"><label htmlFor="bulk-member-order">Display order</label><input id="bulk-member-order" type="number" min={0} max={10000} step={1} value={values.order} aria-invalid={Boolean(errors.order)} onChange={(event) => change('order', event.target.value)} />{errors.order && <p className="admin-field__error" role="alert">{errors.order}</p>}</div>
        <div className="admin-field admin-featured"><label><input type="checkbox" checked={values.featured} onChange={(event) => change('featured', event.target.checked)} /> Feature selected users on home page</label></div>
      </div></fieldset>
      <UserPicker id="team-users" selected={selected} onChange={(users) => { setSelected(users); setErrors((current) => ({ ...current, users: '' })) }} disabled={busy} unavailable={(user) => user.batches.includes(values.batch) ? 'Already in this batch' : ''} />
      {errors.users && <p className="admin-field__error" role="alert">{errors.users}</p>}
      {error && <p className="admin-alert admin-alert--error" role="alert">{error}</p>}
      <div className="admin-bulk-review"><strong>{selected.length} {selected.length === 1 ? 'user' : 'users'} → {values.batch || 'Choose a batch'}</strong><span>{groupLabels[values.group]}{values.role ? ` · ${values.role}` : ''}</span></div>
      <div className="admin-editor__actions"><button className="admin-button admin-button--primary" type="submit" disabled={busy || !selected.length}>{busy ? 'Adding team members…' : `Add ${selected.length || 'selected'} ${selected.length === 1 ? 'user' : 'users'} to team`}</button><button className="admin-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
    </form>
  </section>
}
