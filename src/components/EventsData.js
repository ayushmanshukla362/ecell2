// Keep historical event URLs unchanged: punctuation and repeated spaces matter.
export const createEventSlug = (title = '') => title.toLowerCase().replace(/ /g, '-')

export const findEventBySlug = (events, slug = '') => {
  const exact = events.find((event) => createEventSlug(event.title) === slug)
  if (exact) return exact
  // Preserve the old Navy Visit route even if its display title is updated.
  if (slug === 'navy-visit-2023') return events.find((event) => String(event.id) === '2')
  return undefined
}
