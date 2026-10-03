import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Idea from './Idea'
import events from './EventsData'
import EventCard from './events/EventCard'
import YearSelector from './events/YearSelector'

function EventsPage() {
  const [selectedYear, setSelectedYear] = useState('2026')
  const eventsForYear = (
    selectedYear === 'Previous Years'
      ? events.filter((event) => event.year < 2023)
      : events.filter((event) => String(event.year) === selectedYear)
  )

  return (
    <main className="archive-page" aria-labelledby="archive-title">
      <header className="archive-header site-section">
        <div>
          <p className="eyebrow"><span>01</span> / The archive</p>
          <h1 id="archive-title">Where ideas<br /><em>take the stage.</em></h1>
        </div>
        <div className="archive-header__aside">
          <p>A record of the conversations, competitions and collaborations that keep E-Cell ABES moving.</p>
          <Link className="text-link" to="/#connect">Bring us your idea <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
      </header>

      <div className="site-section">
        <YearSelector selectedYear={selectedYear} onChange={setSelectedYear} />
        <div className="archive-results" aria-live="polite" aria-busy={!eventsForYear.length}>
          <AnimatePresence mode="wait">
            <motion.div key={selectedYear} className="archive-grid" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
              {eventsForYear.length > 0 ? eventsForYear.map((event, index) => <EventCard key={event.id} event={event} index={index} />) : (
                <div className="archive-empty"><span>—</span><h2>No events listed for {selectedYear.toLowerCase()} yet.</h2><p>Explore another year to see more from E-Cell ABESEC.</p></div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <Idea />
    </main>
  )
}

export default EventsPage
