/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Pencil, Plus, RefreshCw, Trash2, Users, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import ImageField from '../admin/ImageField'
import MediaLibrary from '../admin/MediaLibrary'
import AccessPanel from '../admin/AccessPanel'
import BulkMemberEditor from '../admin/BulkMemberEditor'
import { useContentActions } from '../content/ContentContext'
import ContentImage from '../content/ContentImage'
import { compareContent, contentBatches, contentYears, EVENT_TYPES, EVENT_TYPE_LABELS, MEMBER_GROUPS, STORY_FIELDS } from '../content/contentUtils'
import { contentFormValues, contentPayload, validateContentForm } from '../content/contentForms'
import '../admin.css'

const groupLabels = { executives: 'Executives', mentors: 'Mentors', alumni: 'Alumni', volunteers: 'Volunteers' }
const storyLabels = { about: 'About the event', vision: 'Our vision', callout: 'In focus / callout', review: 'Event review', conclusion: 'Conclusion' }

function Field({ name, label, values, onChange, errors, multiline = false, hint, wide = false, ...props }) {
  const Tag = multiline ? 'textarea' : 'input'
  return <div className={`admin-field ${wide ? 'admin-field--wide' : ''}`}>
    <label htmlFor={`content-${name}`}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>
    <Tag id={`content-${name}`} name={name} value={values[name]} onChange={(event) => onChange(name, event.target.value)} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `content-${name}-error` : hint ? `content-${name}-hint` : undefined} rows={multiline ? 4 : undefined} {...props} />
    {hint && <small id={`content-${name}-hint`}>{hint}</small>}
    {errors[name] && <span className="admin-field__error" id={`content-${name}-error`}>{errors[name]}</span>}
  </div>
}

function ContentEditor({ collection, item, busy, onSave, onCancel }) {
  const [values, setValues] = useState(() => contentFormValues(collection, item || {}))
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [uploads, setUploads] = useState({})
  const uploading = Object.values(uploads).some((state) => state.busy)
  const uploadErrors = Object.values(uploads).some((state) => state.errors)
  const locked = busy || uploading
  const reportUpload = useCallback((name, state) => setUploads((current) => ({ ...current, [name]: state })), [])
  useEffect(() => {
    if (!uploading) return undefined
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])
  const firstField = useRef(null)
  const isMember = collection === 'members'
  const noun = isMember ? 'member' : 'event'

  useEffect(() => { firstField.current?.querySelector('input')?.focus() }, [])
  const change = (name, value) => setValues((current) => ({ ...current, [name]: typeof value === 'function' ? value(current[name]) : value }))
  const imageField = (name, label, gallery = false) => <ImageField name={name} label={label} value={values[name]} onChange={change} error={errors[name]} disabled={locked} gallery={gallery} onUploadState={reportUpload} />
  const field = (name, label, props = {}) => <Field key={name} name={name} label={label} values={values} onChange={change} errors={errors} {...props} />
  const submit = async (event) => {
    event.preventDefault()
    if (locked || uploadErrors) return
    const issues = validateContentForm(collection, values)
    if (!isMember && values.images.split('\n').filter((url) => url.trim()).length > 30) issues.images = 'A gallery can contain up to 30 images.'
    setErrors(issues)
    setSaveError('')
    if (Object.keys(issues).length) {
      const invalid = firstField.current?.querySelector(`[name="${Object.keys(issues)[0]}"]`)
      const advanced = invalid?.closest('details')
      if (advanced) advanced.open = true
      invalid?.focus()
      return
    }
    try { await onSave(contentPayload(collection, values)) }
    catch (error) { setSaveError(error.message || 'Your changes could not be saved. Please try again.') }
  }

  return <section className="admin-editor" aria-labelledby="editor-title">
    <header><div><p className="eyebrow">{item ? 'Edit content' : 'New content'}</p><h2 id="editor-title">{item ? `Edit ${noun}` : `Create ${noun}`}</h2></div><button className="admin-icon-button" type="button" onClick={onCancel} disabled={locked} aria-label="Close editor"><X size={22} /></button></header>
    <p className="admin-editor__note">Changes are published immediately. Required fields are marked *. Upload images from your computer or reuse uploaded media. Images are public: publish only images you have permission to use. Existing image URLs remain available under Advanced; links use HTTPS.</p>
    <form ref={firstField} onSubmit={submit} noValidate aria-busy={locked}>
      <fieldset disabled={locked}>
        <legend className="sr-only">{isMember ? 'Member' : 'Event'} details</legend>
        <div className="admin-form-grid">
          {isMember ? <>
            {item?.account && <div className="admin-field admin-field--wide"><label htmlFor="member-account">Linked user account</label><input id="member-account" readOnly value={item.account.email} /><small>This profile is linked to a registered user. Their email is visible only in the admin panel.</small></div>}
            {field('name', 'Name', { required: true, maxLength: 120 })}
            {field('role', values.group === 'volunteers' ? 'Department / role' : 'Role', { maxLength: 160 })}
            {field('batch', 'Batch', { required: true, placeholder: '2025-2026', hint: 'Two consecutive years: YYYY-YYYY.' })}
            <div className="admin-field"><label htmlFor="content-group">Group *</label><select id="content-group" name="group" value={values.group} onChange={(event) => change('group', event.target.value)} aria-invalid={Boolean(errors.group)}>{MEMBER_GROUPS.map((group) => <option key={group} value={group}>{groupLabels[group]}</option>)}</select>{errors.group && <span className="admin-field__error">{errors.group}</span>}</div>
            {field('description', 'Description', { multiline: true, maxLength: 600, wide: true })}
            {imageField('image', 'Portrait image')}
            {field('instagram', 'Instagram URL', { type: 'url', placeholder: 'https://www.instagram.com/…' })}
            {field('linkedin', 'LinkedIn URL', { type: 'url', placeholder: 'https://www.linkedin.com/in/…' })}
          </> : <>
            {field('title', 'Title', { required: true, maxLength: 160, wide: true, hint: 'The title determines the public event URL. Changing it changes that URL.' })}
            {field('date', 'Display date', { required: true, maxLength: 100, placeholder: 'February 21st, 2026' })}
            {field('year', 'Archive year', { type: 'number', required: true, min: 1900, max: 2200, step: 1 })}
            <div className="admin-field"><label htmlFor="content-type">Type *</label><select id="content-type" name="type" value={values.type} onChange={(event) => change('type', event.target.value)} aria-invalid={Boolean(errors.type)} aria-describedby={errors.type ? 'content-type-error' : undefined} required>{EVENT_TYPES.map((type) => <option key={type} value={type}>{EVENT_TYPE_LABELS[type]}</option>)}</select>{errors.type && <span className="admin-field__error" id="content-type-error">{errors.type}</span>}</div>
            {field('category', 'Category', { maxLength: 100 })}
            {field('venue', 'Venue', { maxLength: 200 })}
            {field('shortDescription', 'Short description', { multiline: true, maxLength: 600, wide: true })}
            {field('registrationUrl', 'Registration URL', { type: 'url', placeholder: 'https://…', wide: true })}
            {imageField('image', 'Cover image')}
            {imageField('listingImage', 'Listing image')}
            {field('speakers', 'Speakers', { multiline: true, hint: 'One speaker per line.' })}
            {field('highlights', 'Highlights', { multiline: true, hint: 'One highlight per line.' })}
          </>}
          {field('order', 'Display order', { type: 'number', required: true, min: 0, max: 10000, step: 1, hint: 'Lower numbers appear first (0–10000). Applies to featured content and lists.' })}
          <div className="admin-field admin-featured"><label><input type="checkbox" checked={values.featured} onChange={(event) => change('featured', event.target.checked)} /> Featured on home page</label><small>Only checked items appear on the home page. Uncheck all to leave that preview empty.</small></div>
        </div>
        {!isMember && <>
          <h3 className="admin-form-heading">Event story</h3>
          <div className="admin-form-grid">{STORY_FIELDS.map((name) => field(name, storyLabels[name], { multiline: true, wide: true }))}</div>
          <h3 className="admin-form-heading">Gallery</h3>
          {imageField('images', 'Gallery image', true)}
        </>}
      </fieldset>
      {Object.keys(errors).length > 0 && <p className="admin-alert admin-alert--error" role="alert">Please correct the marked fields before saving.</p>}
      {saveError && <p className="admin-alert admin-alert--error" role="alert">{saveError}</p>}
      {uploading && <p className="admin-alert" role="status">Images are uploading. Saving and closing are disabled until all uploads finish.</p>}
      {uploadErrors && !uploading && <p className="admin-alert admin-alert--error" role="alert">Review upload failures: retry or dismiss each failure before publishing.</p>}
      <div className="admin-editor__actions"><button className="admin-button admin-button--primary" type="submit" disabled={locked || uploadErrors}>{uploading ? 'Uploading images…' : busy ? 'Saving…' : item ? 'Save changes' : `Publish ${noun}`}</button><button className="admin-button" type="button" onClick={onCancel} disabled={locked}>Cancel</button></div>
    </form>
  </section>
}

function Admin() {
  const { user } = useAuth()
  const [panel, setPanel] = useState('content')
  const [panelBusy, setPanelBusy] = useState(false)
  const { refresh: refreshPublic } = useContentActions()
  const [content, setContent] = useState({ events: [], members: [] })
  const [collection, setCollection] = useState('events')
  const [requestedPeriod, setPeriod] = useState('all')
  const [group, setGroup] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState(null)
  const request = useRef(0)
  const mutation = useRef(false)

  const load = useCallback(async () => {
    const current = ++request.current
    setLoading(true)
    setLoadError('')
    try {
      const data = await api('/api/admin/content')
      if (!Array.isArray(data?.events) || !Array.isArray(data?.members)) throw new Error('The content response was incomplete.')
      if (request.current === current) setContent({ events: data.events, members: data.members })
    } catch (error) {
      if (request.current === current) setLoadError(error.message || 'Content could not be loaded.')
    } finally {
      if (request.current === current) setLoading(false)
    }
  }, [])
  useEffect(() => { load(); return () => { request.current += 1 } }, [load])

  const member = collection === 'members'
  const periods = member ? contentBatches(content.members) : contentYears(content.events)
  const period = periods.includes(requestedPeriod) ? requestedPeriod : 'all'
  const visible = content[collection].filter((item) => (period === 'all' || String(member ? item.batch : item.year) === period)
    && (!member || group === 'all' || item.group === group)
    && `${item.title || item.name} ${item.role || item.category || ''} ${item.account?.email || ''}`.toLowerCase().includes(search.trim().toLowerCase())).sort(compareContent)

  const openEditor = (item = null) => { setEditor({ item }); setActionError(''); setNotice('') }
  const save = async (body) => {
    if (mutation.current) return
    mutation.current = true
    setBusy(true)
    setActionError('')
    try {
      const id = editor.item?.id
      const result = await api(`/api/admin/${collection}${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PUT' : 'POST', body })
      if (!result?.item?.id) throw new Error('The server did not return the saved item. Reload content before trying again.')
      setContent((current) => ({ ...current, [collection]: id ? current[collection].map((item) => item.id === id ? result.item : item) : [...current[collection], result.item] }))
      setEditor(null)
       const refreshed = await refreshPublic({ fresh: true })
      setNotice(refreshed ? 'Saved and published successfully.' : 'Saved successfully. The public preview could not refresh; retry loading content on the public page.')
    } finally { mutation.current = false; setBusy(false) }
  }
  const addUsers = async (body) => {
    if (mutation.current) return
    mutation.current = true
    setBusy(true)
    setActionError('')
    try {
      const result = await api('/api/admin/members/bulk', { method: 'POST', body })
      if (!Array.isArray(result?.items) || !Array.isArray(result.skipped)) throw new Error('The server response was incomplete. Reload content before retrying.')
      setContent((current) => ({ ...current, members: [...current.members, ...result.items.filter((item) => !current.members.some((member) => member.id === item.id))] }))
      setEditor(null)
      setPeriod(body.batch)
      setGroup('all')
      setSearch('')
       const refreshed = await refreshPublic({ fresh: true })
      setNotice(`Added ${result.items.length} ${result.items.length === 1 ? 'member' : 'members'} to ${body.batch}.${result.skipped.length ? ` ${result.skipped.length} already in this batch were skipped.` : ''}${!refreshed ? ' Reload the public page to refresh its preview.' : ''}`)
    } finally { mutation.current = false; setBusy(false) }
  }
  const remove = async (item) => {
    if (mutation.current || !window.confirm(`Delete “${item.title || item.name}”? This removes it from the public site and cannot be undone.`)) return
    mutation.current = true
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await api(`/api/admin/${collection}/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      setContent((current) => ({ ...current, [collection]: current[collection].filter((record) => record.id !== item.id) }))
       const refreshed = await refreshPublic({ fresh: true })
      setNotice(refreshed ? 'Deleted successfully.' : 'Deleted successfully. The public preview could not refresh; retry loading content on the public page.')
    } catch (error) { setActionError(error.message || 'The item could not be deleted.') }
    finally { mutation.current = false; setBusy(false) }
  }
  const switchCollection = (next) => { setCollection(next); setPeriod('all'); setGroup('all'); setSearch(''); setActionError(''); setNotice('') }
  const disabled = busy || loading

  return <main className="admin-page site-section" aria-labelledby="admin-title">
    <header className="admin-header"><div><p className="eyebrow"><span>Dashboard</span> / Content studio</p><h1 id="admin-title">Keep the story<br /><em>moving.</em></h1><p>Manage events, team batches and the people featured on your home page.</p></div><Link className="text-link" to="/">View public site <ArrowUpRight size={17} aria-hidden="true" /></Link></header>
    <nav className="admin-tabs admin-panel-tabs" aria-label="Administration sections">
      {[['content', 'Content'], ['media', 'Media'], ...(user?.isOwner ? [['access', 'Access management']] : [])].map(([key, label]) => <button type="button" key={key} className={panel === key ? 'is-selected' : ''} aria-pressed={panel === key} disabled={busy || panelBusy || Boolean(editor)} onClick={() => { setPanel(key); setPanelBusy(false) }}>{label}</button>)}
    </nav>
    {!user?.isOwner && <p className="admin-access-note">You can manage content and media. Only a site owner can manage administrator access.</p>}
    {panel === 'media' && <MediaLibrary onBusyChange={setPanelBusy} />}
    {panel === 'access' && user?.isOwner && <AccessPanel user={user} onBusyChange={setPanelBusy} />}
    {panel === 'content' && <>
    <div className="admin-toolbar">
      <div className="admin-tabs" role="group" aria-label="Content collection">{['events', 'members'].map((name) => <button type="button" key={name} aria-pressed={collection === name} className={collection === name ? 'is-selected' : ''} disabled={busy || Boolean(editor)} onClick={() => switchCollection(name)}>{name === 'events' ? 'Events' : 'Team & volunteers'} <span>{content[name].length}</span></button>)}</div>
       <div className="admin-toolbar__actions"><button className="admin-button" type="button" disabled={disabled || Boolean(editor)} onClick={load}><RefreshCw size={16} aria-hidden="true" /> Reload</button><button className={`admin-button ${member ? '' : 'admin-button--primary'}`} type="button" disabled={disabled || Boolean(editor) || Boolean(loadError)} onClick={() => openEditor()}><Plus size={17} aria-hidden="true" /> {member ? 'Create user' : 'Add event'}</button>{member && <button className="admin-button admin-button--primary" type="button" disabled={disabled || Boolean(editor) || Boolean(loadError)} onClick={() => { setEditor({ bulk: true }); setActionError(''); setNotice('') }}><Users size={17} aria-hidden="true" /> Add user</button>}</div>
    </div>
    {loading && <p className="admin-alert" role="status">Loading content…</p>}
    {loadError && <div className="admin-alert admin-alert--error" role="alert"><p>{loadError}</p><button className="admin-button" type="button" disabled={disabled} onClick={load}>Try again</button></div>}
    {actionError && <p className="admin-alert admin-alert--error" role="alert">{actionError}</p>}
    {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}
    {editor && (editor.bulk ? <BulkMemberEditor batch={period} group={group} batches={contentBatches(content.members)} busy={busy} onSave={addUsers} onCancel={() => setEditor(null)} /> : <ContentEditor key={`${collection}-${editor.item?.id || 'new'}`} collection={collection} item={editor.item} busy={busy} onSave={save} onCancel={() => setEditor(null)} />)}
    <section className="admin-list" aria-label={member ? 'Team members' : 'Events'} aria-busy={disabled}>
      <div className="admin-filters">
        <label>Search<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={member ? 'Name, email or role' : 'Title or category'} /></label>
        <label>{member ? 'Batch' : 'Year'}<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">All {member ? 'batches' : 'years'}</option>{periods.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        {member && <label>Group<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">All groups</option>{MEMBER_GROUPS.map((value) => <option key={value} value={value}>{groupLabels[value]}</option>)}</select></label>}
      </div>
      <p className="admin-count" aria-live="polite">{visible.length} {member ? 'members' : 'events'} shown · Featured items appear on home, lowest order first.</p>
      {!loading && !loadError && visible.length === 0 && <div className="admin-empty"><h2>{content[collection].length ? 'No matching items.' : 'A fresh start.'}</h2><p>{content[collection].length ? 'Try a different filter or search.' : `Add your first ${member ? 'member' : 'event'} to publish it on the site.`}</p></div>}
      <div className="admin-records">{visible.map((item) => <article className="admin-record" key={item.id}>
        <ContentImage className="admin-record__image" src={item.listingImage || item.image} alt="" width="90" height="90" loading="lazy" />
        <div className="admin-record__copy"><h2>{item.title || item.name}</h2><p>{member ? `${item.batch} · ${groupLabels[item.group]}${item.role ? ` · ${item.role}` : ''}` : `${item.year} · ${item.date}${item.category ? ` · ${item.category}` : ''}`}</p>{item.account && <p>{item.account.email}</p>}<div className="admin-record__tags">{item.featured && <span className="admin-badge">Featured</span>}<span>Order {item.order}</span></div></div>
        <div className="admin-record__actions"><button className="admin-button" type="button" disabled={disabled || Boolean(editor) || Boolean(loadError)} aria-label={`Edit ${item.title || item.name}`} onClick={() => openEditor(item)}><Pencil size={15} aria-hidden="true" /> Edit</button><button className="admin-button admin-button--danger" type="button" disabled={disabled || Boolean(editor) || Boolean(loadError)} aria-label={`Delete ${item.title || item.name}`} onClick={() => remove(item)}><Trash2 size={15} aria-hidden="true" /> Delete</button></div>
      </article>)}</div>
    </section>
    </>}
  </main>
}

export default Admin
