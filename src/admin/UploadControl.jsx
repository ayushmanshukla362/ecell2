/* eslint-disable react/prop-types */
import { useId, useRef, useState } from 'react'
import { api } from '../lib/api'

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxBytes = 8 * 1024 * 1024
const extensionTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

function fileType(file) {
  if (allowedTypes.includes(file.type)) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extensionTypes[extension] || ''
}

async function uploadFile(file) {
  const type = fileType(file)
  const setup = await api('/api/admin/uploads/init', { method: 'POST', body: { name: file.name.slice(0, 255), type, size: file.size } })
  if (setup?.mode === 'local') return api('/api/admin/uploads', { method: 'POST', body: new Blob([file], { type }) })
  if (setup?.mode !== 'neon-object-storage' || !setup.uploadUrl || !setup.uploadId) throw new Error('The image upload service is not configured. Please contact the site administrator.')
  let response
  try {
    response = await fetch(setup.uploadUrl, { method: 'PUT', mode: 'cors', credentials: 'omit', headers: setup.headers || { 'Content-Type': type }, body: file })
  } catch {
    throw new Error('The image could not reach storage. Check the storage bucket CORS setting for this site, then retry.')
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 180)
    throw new Error(`Storage rejected the image (${response.status}${detail ? `: ${detail}` : ''}). Please retry.`)
  }
  return api('/api/admin/uploads/finalize', { method: 'POST', body: { uploadId: setup.uploadId } })
}

function fileError(file) {
  if (!fileType(file)) return 'Choose a JPEG, PNG, or WebP image.'
  if (!file.size) return 'This file is empty. Choose another image.'
  if (file.size > maxBytes) return 'This image exceeds the 8 MiB limit.'
  return ''
}

function readPreview(file) {
  // Data URLs work with the site's image CSP; blob: is intentionally not allowed.
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
}

export default function UploadControl({ label, multiple = false, remaining = 1, disabled = false, onUploaded, onRemoved, onStateChange }) {
  const id = useId()
  const [entries, setEntries] = useState([])
  const [busy, setBusy] = useState(false)
  const [selectionError, setSelectionError] = useState('')
  const lock = useRef(false)

  const report = (uploading, list, extraError = false) => onStateChange?.({ busy: uploading, errors: extraError || list.some((entry) => entry.status === 'error') })
  const upload = async (list, indices) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    report(true, list)
    let next = list.map((entry, index) => indices.includes(index) ? { ...entry, status: 'waiting', error: '' } : entry)
    setEntries(next)
    for (const index of indices) {
      const entry = next[index]
      const invalid = fileError(entry.file)
      if (invalid) next = next.map((item, i) => i === index ? { ...item, status: 'error', error: invalid } : item)
      else {
        const preview = entry.preview || await readPreview(entry.file)
        next = next.map((item, i) => i === index ? { ...item, preview, status: 'uploading' } : item)
        setEntries(next)
        try {
          const result = await uploadFile(entry.file)
          if (!result?.image?.url) throw new Error('The server did not return an image URL. Check Media before retrying.')
          onUploaded(result.image)
          next = next.map((item, i) => i === index ? { ...item, preview: result.image.url, url: result.image.url, status: 'success' } : item)
        } catch (error) {
          next = next.map((item, i) => i === index ? { ...item, status: 'error', error: error.message || 'Upload failed. Please retry.' } : item)
        }
      }
      setEntries(next)
    }
    lock.current = false
    setBusy(false)
    report(false, next)
  }
  const choose = (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length || lock.current) return
    if (files.length > remaining) {
      setSelectionError(`Choose at most ${remaining} more image${remaining === 1 ? '' : 's'}. A gallery can contain up to 30 images.`)
      report(false, entries, true)
      return
    }
    setSelectionError('')
    const next = files.map((file) => ({ file, preview: '', status: 'waiting', error: '' }))
    upload(next, next.map((_, index) => index))
  }
  const dismiss = (index) => {
    const next = entries.filter((_, i) => i !== index)
    setEntries(next)
    report(false, next, Boolean(selectionError))
  }
  const removeUploaded = (index) => {
    const entry = entries[index]
    if (entry?.status !== 'success') return
    const next = entries.filter((_, i) => i !== index)
    setEntries(next)
    onRemoved?.(entry.url)
    report(false, next, Boolean(selectionError))
  }
  const failed = entries.some((entry) => entry.status === 'error')
  const complete = entries.filter((entry) => ['success', 'error'].includes(entry.status)).length

  return <div className="admin-upload" aria-busy={busy}>
    <label htmlFor={id}>{label}</label>
    <input id={id} type="file" accept={allowedTypes.join(',')} multiple={multiple} onChange={choose} disabled={disabled || busy || failed || remaining < 1} aria-describedby={`${id}-hint`} />
    <small id={`${id}-hint`}>JPEG, PNG or WebP · up to 8 MiB each. {multiple && 'Select multiple images at once. '}Uploads are public; only upload images you have permission to publish.</small>
    {busy && <div className="admin-upload__progress" role="status"><span>Uploading images… {complete} of {entries.length} processed. Please wait before saving or closing.</span><progress aria-label={`${label} progress`} max={entries.length || 1} value={complete} /></div>}
    {selectionError && <div className="admin-alert admin-alert--error" role="alert"><p>{selectionError}</p><button type="button" className="admin-button" disabled={disabled || busy} onClick={() => { setSelectionError(''); report(false, entries) }}>Dismiss selection error</button></div>}
    {entries.length > 0 && <ul className="admin-upload__queue" aria-label={`${label} results`}>{entries.map((entry, index) => <li key={`${entry.file.name}-${index}`}>
      {entry.preview && <img src={entry.preview} alt={`Selected file ${entry.file.name}`} width="48" height="48" />}
      <div><strong>{entry.file.name}</strong><span>{entry.status === 'success' ? 'Uploaded successfully.' : entry.status === 'error' ? 'Not uploaded.' : entry.status === 'uploading' ? 'Uploading…' : 'Waiting…'}</span>
        {entry.error && <p className="admin-field__error" role="alert">{entry.error}</p>}
        {entry.status === 'success' && <div className="admin-upload__actions"><button type="button" className="admin-button" disabled={disabled || busy} onClick={() => removeUploaded(index)}>Remove {entry.file.name} from this form</button></div>}
        {entry.status === 'error' && <div className="admin-upload__actions"><button type="button" className="admin-button" disabled={disabled || busy || Boolean(fileError(entry.file)) || remaining < 1} onClick={() => upload(entries, [index])}>Retry {entry.file.name}</button><button type="button" className="admin-button" disabled={disabled || busy} onClick={() => dismiss(index)}>Dismiss failure for {entry.file.name}</button></div>}
      </div>
    </li>)}</ul>}
    {failed && <p className="admin-field__error">Some files were not uploaded. Retry them or dismiss each failure before saving. Successful uploads are kept.</p>}
  </div>
}
