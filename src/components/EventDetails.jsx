import { CalendarDays, Share2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import { findEventBySlug } from './EventsData'

const sectionLabels = { about: 'About the event', vision: 'Our vision', callout: 'In focus', review: 'Event review', conclusion: 'Conclusion' }

function EventDetails() {
  const { slug } = useParams()
  const event = findEventBySlug(slug)

  if (!event) {
    return (
      <main className="event-detail-page event-detail-page--missing">
        <div><p className="eyebrow"><span>404</span> / Archive</p><h1>Event not found.</h1><Link className="text-link" to="/events">Back to the archive</Link></div>
      </main>
    )
  }

  const sections = event.descriptionSections || { about: event.description || '' }
  const heroImage = event.images?.[0] || event.image
  const handleShare = () => {
    const shareData = { title: event.title, text: `Check out this event: ${event.title}`, url: window.location.href }
    if (navigator.share) navigator.share(shareData).catch(() => {})
    else navigator.clipboard?.writeText(window.location.href)
  }

  return (
    <main className="event-detail-page" aria-labelledby="event-detail-title">
      <div className="site-section">
        <Link to="/events" className="back-link">← Back to the archive</Link>
        <section className="event-detail-hero">
          <motion.div className="event-detail-hero__copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }}>
            <p className="eyebrow"><span>{event.year}</span> / {event.category}</p>
            <h1 id="event-detail-title">{event.title}</h1>
            <p className="event-detail-hero__summary">{event.shortDescription}</p>
            <div className="event-detail-hero__actions">
              <span><CalendarDays size={16} aria-hidden="true" /> {event.date}</span>
              <button type="button" onClick={handleShare}><Share2 size={15} aria-hidden="true" /> Share event</button>
            </div>
          </motion.div>
          <motion.figure className="event-detail-hero__image" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.1 }}>
            <img src={heroImage} alt={`${event.title} event`} width="1200" height="800" />
            <figcaption>{event.category} / {event.year}</figcaption>
          </motion.figure>
        </section>

        <div className="event-detail-meta">
          <div><span>Venue</span><strong>{event.venue === 'TODO: add venue' ? 'Venue details unavailable' : event.venue}</strong></div>
          <div><span>Speakers</span><strong>{event.speakers?.length ? event.speakers.join(', ') : 'Not listed'}</strong></div>
          <div><span>Highlights</span><strong>{event.highlights?.length ? event.highlights.join(' · ') : 'Not listed'}</strong></div>
        </div>

        {event.images?.length > 1 && (
          <div className="event-detail-gallery" aria-label="Event gallery">
            {event.images.slice(0, 4).map((image, index) => <img key={`${event.title}-${index}`} src={image} alt={`${event.title} moment ${index + 1}`} loading="lazy" />)}
          </div>
        )}

        <section className="event-detail-copy" aria-label="Event story">
          {Object.entries(sectionLabels).map(([key, label], index) => sections[key] ? (
            <motion.article key={key} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: 0.55, delay: index * 0.05 }}>
              <span className="event-detail-copy__index">0{index + 1}</span>
              <div><h2>{label}</h2><p>{sections[key]}</p></div>
            </motion.article>
          ) : null)}
        </section>
      </div>
    </main>
  )
}

export default EventDetails
