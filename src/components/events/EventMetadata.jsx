import { eventTypeLabel } from '../../content/contentUtils'

/* eslint-disable react/prop-types */
function EventMetadata({ event }) {
  const metadata = [
    ['Type', eventTypeLabel(event.type)],
    ['Category', event.category],
    ['Year', event.year],
    ['Venue', event.venue],
  ]

  return (
    <aside className="rounded-xl border border-zinc-800 bg-zinc-900 p-5" aria-label="Event metadata">
      <dl className="grid gap-4 sm:grid-cols-3">
        {metadata.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-yellow-500">{label}</dt>
            <dd className="mt-1 text-zinc-200">{value || 'Not available'}</dd>
          </div>
        ))}
      </dl>
      {event.speakers?.length > 0 && (
        <div className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-yellow-500">Speakers</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {event.speakers.map((speaker) => <li key={speaker} className="rounded-full bg-black px-3 py-1 text-sm text-zinc-300">{speaker}</li>)}
          </ul>
        </div>
      )}
      {event.highlights?.length > 0 && (
        <div className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-yellow-500">Highlights</h2>
          <ul className="mt-2 list-inside list-disc text-zinc-300">
            {event.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
          </ul>
        </div>
      )}
      {event.registrationUrl && <a className="mt-5 inline-flex text-yellow-500 underline" href={event.registrationUrl}>Register for this event</a>}
    </aside>
  )
}

export default EventMetadata
