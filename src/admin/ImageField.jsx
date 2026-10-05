/* eslint-disable react/prop-types */
import { useId, useState } from 'react'
import ContentImage from '../content/ContentImage'
import MediaLibrary from './MediaLibrary'
import UploadControl from './UploadControl'

const urls = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean)

export default function ImageField({ name, label, value, onChange, error, disabled, gallery = false, onUploadState }) {
  const id = useId()
  const [library, setLibrary] = useState(false)
  const selected = gallery ? urls(value) : value ? [value] : []
  const add = (url) => {
    onChange(name, gallery ? (current) => [...urls(current), url].join('\n') : url)
    setLibrary(false)
  }
  const remove = (index) => onChange(name, gallery ? (current) => urls(current).filter((_, i) => i !== index).join('\n') : '')
  const full = gallery && selected.length >= 30

  return <section className={`admin-image-field ${gallery ? 'admin-field--wide' : ''}`} aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>{label}</h3>
    <UploadControl label={`Upload ${label.toLowerCase()}${gallery ? 's' : ''}`} multiple={gallery} remaining={gallery ? Math.max(0, 30 - selected.length) : 1} disabled={disabled} onUploaded={(image) => add(image.url)} onRemoved={(url) => onChange(name, gallery ? (current) => urls(current).filter((value) => value !== url).join('\n') : '')} onStateChange={(state) => onUploadState(name, state)} />
    <button type="button" className="admin-button" disabled={disabled || full} onClick={() => setLibrary((current) => !current)} aria-expanded={library}>{library ? 'Hide media library' : `Choose ${label.toLowerCase()} from media`}</button>
    {library && <MediaLibrary onSelect={add} disabled={disabled || full} />}
    {gallery && <p className="admin-image-field__hint">{selected.length} / 30 images. Displayed in this order; the first gallery image is the event hero.</p>}
    {selected.length > 0 && <ol className="admin-image-previews">{selected.map((url, index) => <li key={`${index}-${url}`}>
      <ContentImage src={url} alt={`${label} preview${gallery ? ` ${index + 1}` : ''}`} width="160" height="110" />
      <span title={url}>{gallery ? `${index + 1}. ` : ''}{url}</span>
      <button type="button" className="admin-button" disabled={disabled} onClick={() => remove(index)} aria-label={`Remove ${label.toLowerCase()}${gallery ? ` ${index + 1}` : ''}`}>Remove reference</button>
    </li>)}</ol>}
    {selected.length > 0 && <p className="admin-image-field__hint">Choose another file to {gallery ? 'add to the gallery' : 'replace this image'}. Removing a reference does not delete the upload.</p>}
    <details className="admin-image-advanced"><summary>Advanced: existing image URL{gallery ? 's' : ''}</summary><div className="admin-field">
      <label htmlFor={`content-${name}`}>{gallery ? 'Gallery image URLs' : `${label} URL`}</label>
      {gallery ? <textarea id={`content-${name}`} name={name} value={value} rows={4} onChange={(event) => onChange(name, event.target.value)} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`} /> : <input id={`content-${name}`} name={name} value={value} onChange={(event) => onChange(name, event.target.value)} disabled={disabled} placeholder="https://… or /uploads/…" aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`} />}
      <small id={`${id}-hint`}>Optional: reuse an HTTPS URL or a local image path. {gallery && 'One URL per line, up to 30 images.'}</small>
    </div></details>
    {error && <p className="admin-field__error" role="alert">{error}</p>}
  </section>
}
