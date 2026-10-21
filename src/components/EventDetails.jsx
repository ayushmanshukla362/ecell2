import { CalendarDays, Share2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { findEventBySlug } from './EventsData'
import { useContent } from '../content/ContentContext'
import ContentImage from '../content/ContentImage'
import ContentStatus from '../content/ContentStatus'
import { eventTypeLabel } from '../content/contentUtils'

const sectionLabels = { about: 'About the event', vision: 'Our vision', callout: 'In focus', review: 'Event review', conclusion: 'Conclusion' }

function EventDetails() {
  const { slug } = useParams()
  const { events, loading, refreshing, error, retry } = useContent()
  const event = findEventBySlug(events, slug)
  const [shareStatus, setShareStatus] = useState(null)
  const currentShare = shareStatus?.slug === slug ? shareStatus : null

  if (loading || error) return <main className="event-detail-page"><div className="site-section"><Link className="back-link" to="/events">← Back to the archive</Link><ContentStatus loading={loading} refreshing={refreshing} error={error} retry={retry} empty={!event} /></div></main>

  if (!event) {
    return (
      <main className="event-detail-page event-detail-page--missing">
        <div><p className="eyebrow"><span>404</span> / Archive</p><h1>Event not found.</h1><Link className="text-link" to="/events">Back to the archive</Link></div>
      </main>
    )
  }

  const sections = event.descriptionSections || { about: event.description || '' }
  const heroImage = event.images?.[0] || event.image
  const handleShare = async () => {
    const url = window.location.href
    const shareData = { title: event.title, text: `Check out this event: ${event.title}`, url }
    setShareStatus({ slug, busy: true, message: '' })
    if (navigator.share) {
      try {
        await navigator.share(shareData)
        setShareStatus({ slug, message: 'Event shared.' })
        return
      } catch (error) {
        if (error?.name === 'AbortError') {
          setShareStatus({ slug, message: 'Sharing canceled. No link was shared.' })
          return
        }
        // A denied or unavailable native share can still fall back to copying.
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setShareStatus({ slug, message: 'Event link copied to clipboard.' })
    } catch {
      setShareStatus({ slug, error: true, message: 'Could not share or copy automatically. Select and copy the event link below.', manualUrl: url })
    }
  }

  return (
    <main className="event-detail-page" aria-labelledby="event-detail-title">
      <div className="site-section">
        <Link to="/events" className="back-link">← Back to the archive</Link>
        <section className="event-detail-hero">
          <motion.div className="event-detail-hero__copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }}>
            <p className="eyebrow"><span>{event.year}</span> / {eventTypeLabel(event.type)} / {event.category}</p>
            <h1 id="event-detail-title">{event.title}</h1>
            <p className="event-detail-hero__summary">{event.shortDescription}</p>
            <div className="event-detail-hero__actions">
              <span><CalendarDays size={16} aria-hidden="true" /> {event.date}</span>
              <button type="button" onClick={handleShare} disabled={currentShare?.busy} aria-busy={Boolean(currentShare?.busy)}><Share2 size={15} aria-hidden="true" /> {currentShare?.busy ? 'Sharing…' : 'Share event'}</button>
              {event.registrationUrl && <a className="text-link" href={event.registrationUrl} target="_blank" rel="noreferrer noopener">Register for this event ↗</a>}
            </div>
            <p className={`event-share-status${currentShare?.error ? ' is-error' : ''}`} role={currentShare?.error ? 'alert' : 'status'}>{currentShare?.message}</p>
            {currentShare?.manualUrl && <div className="event-share-fallback">
              <label htmlFor="event-share-url">Event link</label>
              <input id="event-share-url" type="url" readOnly value={currentShare.manualUrl} onFocus={(inputEvent) => inputEvent.currentTarget.select()} />
            </div>}
          </motion.div>
          <motion.figure className="event-detail-hero__image" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.52, delay: 0.06 }}>
            <ContentImage src={heroImage} alt={`${event.title} event`} width="1200" height="800" loading="eager" fetchPriority="high" />
            <figcaption>{eventTypeLabel(event.type)} / {event.category} / {event.year}</figcaption>
          </motion.figure>
        </section>

        <div className="event-detail-meta">
          <div><span>Venue</span><strong>{!event.venue || event.venue === 'TODO: add venue' ? 'Venue details unavailable' : event.venue}</strong></div>
          <div><span>Speakers</span><strong>{event.speakers?.length ? event.speakers.join(', ') : 'Not listed'}</strong></div>
          <div><span>Highlights</span><strong>{event.highlights?.length ? event.highlights.join(' · ') : 'Not listed'}</strong></div>
        </div>

        {event.images?.length > 1 && (
          <div className="event-detail-gallery" aria-label="Event gallery">
            {event.images.map((image, index) => <ContentImage key={`${event.id}-${index}`} src={image} alt={`${event.title} moment ${index + 1}`} loading="lazy" />)}
          </div>
        )}

        <section className="event-detail-copy" aria-label="Event story">
          {Object.entries(sectionLabels).map(([key, label], index) => sections[key] ? (
            <motion.article key={key} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: 0.38, delay: index * 0.03 }}>
              <span className="event-detail-copy__index">0{index + 1}</span>
              <div><h2>{label}</h2><p style={{ whiteSpace: 'pre-line' }}>{sections[key]}</p></div>
            </motion.article>
          ) : null)}
        </section>
      </div>
    </main>
  )
}

export default EventDetails
