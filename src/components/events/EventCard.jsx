import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { createEventSlug } from '../EventsData'

/* eslint-disable react/prop-types */

function EventCard({ event, index = 0 }) {
  const image = event.listingImage || event.image

  return (
    <article className="archive-card">
      <Link to={`/events/${createEventSlug(event.title)}`} className="archive-card__image">
        {image ? <img src={image} alt={`${event.title} event`} width="900" height="506" loading="lazy" /> : null}
        <span className="archive-card__number">{String(index + 1).padStart(2, '0')}</span>
        <span className="archive-card__arrow"><ArrowUpRight size={19} aria-hidden="true" /></span>
      </Link>
      <div className="archive-card__body">
        <div className="archive-card__meta"><span>{event.category}</span><span>{event.date}</span></div>
        <h2>{event.title}</h2>
        <p>{event.shortDescription}</p>
        <Link to={`/events/${createEventSlug(event.title)}`} className="archive-card__link">Read the story <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </div>
    </article>
  )
}

export default EventCard
