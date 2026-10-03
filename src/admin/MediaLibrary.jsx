/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import ContentImage from '../content/ContentImage'
import UploadControl from './UploadControl'

export default function MediaLibrary({ onSelect, disabled = false, onBusyChange }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const request = useRef(0)
  const lock = useRef(false)
  const load = useCallback(async () => {
    const current = ++request.current
    setLoading(true)
    setLoadError('')
    try {
      const result = await api('/api/admin/uploads')
      if (!Array.isArray(result?.images)) throw new Error('The media response was incomplete.')
      if (current === request.current) setImages(result.images)
    } catch (problem) { if (current === request.current) setLoadError(problem.message || 'Images could not be loaded.') }
    finally { if (current === request.current) setLoading(false) }
  }, [])
  useEffect(() => { load(); return () => { request.current += 1 } }, [load])
  useEffect(() => { onBusyChange?.(busy || uploading) }, [busy, uploading, onBusyChange])
  const remove = async (image) => {
    if (lock.current || !window.confirm('Permanently delete this uploaded image? Its public URL will stop working. Only unused uploads can be deleted.')) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/uploads/${encodeURIComponent(image.id)}`, { method: 'DELETE' })
      setImages((current) => current.filter((item) => item.id !== image.id))
      setNotice('Unused image deleted.')
    } catch (problem) {
      setError(problem.message || 'This image could not be deleted. Reload and try again.')
      if (problem.status === 409) await load()
    } finally { lock.current = false; setBusy(false) }
  }
  const blocked = disabled || busy || uploading

  return <section className="admin-media" aria-label={onSelect ? 'Choose an uploaded image' : 'Media library'}>
    <header className="admin-panel-heading"><div><h2>{onSelect ? 'Choose an uploaded image' : 'Media library'}</h2><p>Uploaded images are public. Publish only permitted images. Removing an image from an editor clears its reference, not the uploaded file.</p></div><button className="admin-button" type="button" onClick={load} disabled={blocked || loading}>Reload images</button></header>
    {!onSelect && <UploadControl label="Upload images to media library" multiple remaining={30} disabled={disabled || busy || loading || Boolean(loadError)} onUploaded={(image) => { setImages((current) => [image, ...current]); setNotice('Image uploaded. Select its URL to reuse it in an editor.') }} onStateChange={(state) => setUploading(state.busy)} />}
    {loading && <p className="admin-alert" role="status">Loading images…</p>}
    {loadError && <div className="admin-alert admin-alert--error" role="alert"><p>{loadError}</p><button className="admin-button" type="button" disabled={blocked || loading} onClick={load}>Retry loading images</button></div>}
    {error && <p className="admin-alert admin-alert--error" role="alert">{error}</p>}
    {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}
    {!loading && !loadError && images.length === 0 && <p className="admin-empty">No uploads yet. Choose an image from your computer to get started.</p>}
    <div className="admin-media-grid">{images.map((image) => {
      const references = image.usedBy || []
      const name = image.name || image.id
      return <article className="admin-media-card" key={image.id} aria-label={`Uploaded image ${image.id}`}>
        <ContentImage src={image.url} alt={name} width="220" height="150" loading="lazy" />
        <div><h3>{name}</h3><p>{image.width} × {image.height} · {Math.ceil(image.size / 1024)} KiB</p>
          <label htmlFor={`media-url-${image.id}`}>Image URL</label><input id={`media-url-${image.id}`} aria-label={`Image URL for ${image.id}`} readOnly value={image.url} onFocus={(event) => event.target.select()} />
          {references.length ? <p className="admin-media-card__usage">In use by: {references.map((item) => item.title || item.id).join(', ')}</p> : <p className="admin-media-card__usage">Not referenced by saved content.</p>}
          {onSelect ? <button type="button" className="admin-button admin-button--primary" disabled={blocked} onClick={() => onSelect(image.url)}>Use this image</button> : <button type="button" className="admin-button admin-button--danger" disabled={blocked || references.length > 0 || loading || Boolean(loadError)} onClick={() => remove(image)} aria-label={`Delete upload ${image.id}`}>{references.length ? 'In use — cannot delete' : 'Delete unused image'}</button>}
        </div>
      </article>
    })}</div>
  </section>
}
