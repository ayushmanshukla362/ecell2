import { ArrowUpRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import events, { createEventSlug } from '../EventsData'
import Reveal from '../Reveal'

/* eslint-disable react/prop-types */

const featuredIds = [13, 12, 10]

function EventRow({ event, index }) {
  const image = event.listingImage || event.image

  return (
    <Reveal delay={index * 0.08} className="event-row-wrap">
      <Link className="event-row" to={`/events/${createEventSlug(event.title)}`}>
        <span className="event-row__index">0{index + 1}</span>
        <div className="event-row__image">
          <img src={image} alt={`${event.title} event`} width="900" height="506" loading="lazy" />
        </div>
        <div className="event-row__content">
          <div className="event-row__meta"><span>{event.category}</span><span>{event.year}</span></div>
          <h3>{event.title}</h3>
          <p>{event.shortDescription}</p>
        </div>
        <span className="event-row__arrow" aria-hidden="true"><ArrowUpRight size={21} /></span>
      </Link>
    </Reveal>
  )
}

function EventsSection() {
  const featuredEvents = featuredIds
    .map((id) => events.find((event) => event.id === id))
    .filter(Boolean)

  return (
    <section id="events" className="site-section events-section" aria-labelledby="events-preview-title">
      <div className="section-heading section-heading--events">
        <Reveal>
          <p className="eyebrow"><span>03</span> / In the wild</p>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 id="events-preview-title">Ideas need<br /><em>a place to happen.</em></h2>
        </Reveal>
        <Reveal delay={0.14} className="section-heading__aside">
          <p>From the Entrepreneurship Show to BizzMantra, our events turn curiosity into a shared experience.</p>
          <Link className="text-link" to="/events">View all events <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </Reveal>
      </div>

      <div className="events-list">
        {featuredEvents.map((event, index) => <EventRow key={event.id} event={event} index={index} />)}
      </div>

      <div className="events-footer-note">
        <CalendarDays size={18} aria-hidden="true" />
        <span>2019—2026 / a growing archive of conversations, competitions and collaborations</span>
      </div>
    </section>
  )
}

export default EventsSection
