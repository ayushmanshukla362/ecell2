import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Idea from './Idea'
import { useContent } from '../content/ContentContext'
import ContentStatus from '../content/ContentStatus'
import { compareContent, contentYears } from '../content/contentUtils'
import EventCard from './events/EventCard'
import YearSelector from './events/YearSelector'

function EventsPage() {
  const { events, loading, error, retry } = useContent()
  const [requestedYear, setSelectedYear] = useState('')
  const years = contentYears(events)
  const selectedYear = years.includes(requestedYear) ? requestedYear : years[0] || ''
  const eventsForYear = events.filter((event) => String(event.year) === selectedYear).sort(compareContent)

  return (
    <main className="archive-page" aria-labelledby="archive-title">
      <header className="archive-header site-section">
        <div>
          <p className="eyebrow"><span>01</span> / The archive</p>
          <h1 id="archive-title">Where ideas<br /><em>take the stage.</em></h1>
        </div>
        <div className="archive-header__aside">
          <p>A record of the conversations, competitions and collaborations that keep E-Cell ABES moving.</p>
          <Link className="text-link" to="/contactus#contact-form">Bring us your idea <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
      </header>
      <div className="site-section">
        {years.length > 0 && <YearSelector years={years} selectedYear={selectedYear} onChange={setSelectedYear} />}
        <ContentStatus loading={loading} error={error} retry={retry} empty={!events.length} emptyMessage="No events have been published yet. Check back soon." />
        <div className="archive-results" aria-live="polite" aria-busy={loading}>
          <AnimatePresence mode="wait">
            <motion.div key={selectedYear} className="archive-grid" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.24 }}>
              {eventsForYear.map((event, index) => <EventCard key={event.id} event={event} index={index} />)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <Idea />
    </main>
  )
}

export default EventsPage
