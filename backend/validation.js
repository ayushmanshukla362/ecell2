import { httpError } from './security.js'

function text(value, field, max, required = false) {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw httpError(400, `${field} ${required ? 'is required and ' : ''}must be text up to ${max} characters.`)
  return value.trim()
}
function url(value, field, image = false) {
  const result = text(value, field, 2048)
  if (!result) return ''
  // Reject protocol-relative paths, backslashes, controls and non-HTTPS schemes.
  if ([...result].some((character) => character === '\\' || character.codePointAt(0) < 32 || character.codePointAt(0) === 127)) throw httpError(400, `Invalid ${field} URL.`)
  if (image && result.startsWith('/') && !result.startsWith('//') && !/%(?:2f|5c)/i.test(result)) return result
  try {
    const parsed = new URL(result)
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return result
  } catch { /* Validation error below */ }
  throw httpError(400, `${field} must be an HTTPS URL${image ? ' or a local /path' : ''}.`)
}
function list(value, field, max, convert) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > max) throw httpError(400, `${field} must be a list with at most ${max} items.`)
  return value.map((item) => convert(item, field)).filter(Boolean)
}
function integer(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw httpError(400, `${field} must be a whole number from ${min} to ${max}.`)
  return value
}
export function validateContent(kind, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Send a content object.')
  if (body.featured !== undefined && typeof body.featured !== 'boolean') throw httpError(400, 'featured must be true or false.')
  const common = { featured: body.featured ?? false, order: integer(body.order ?? 0, 'Order', 0, 10000) }
  if (kind === 'events') {
    const sections = body.descriptionSections ?? {}
    if (typeof sections !== 'object' || Array.isArray(sections) || sections === null) throw httpError(400, 'Invalid event story.')
    return {
      ...common,
      title: text(body.title, 'Title', 160, true), date: text(body.date, 'Date', 100, true),
      year: integer(body.year, 'Year', 1900, 2200), category: text(body.category, 'Category', 100),
      shortDescription: text(body.shortDescription, 'Summary', 600), venue: text(body.venue, 'Venue', 200),
      speakers: list(body.speakers, 'Speakers', 50, (v, f) => text(v, f, 160)),
      highlights: list(body.highlights, 'Highlights', 50, (v, f) => text(v, f, 300)),
      registrationUrl: url(body.registrationUrl, 'Registration'),
      image: url(body.image, 'Image', true), listingImage: url(body.listingImage, 'Listing image', true),
      images: list(body.images, 'Gallery', 30, (v, f) => url(v, f, true)),
      descriptionSections: Object.fromEntries(['about', 'vision', 'callout', 'review', 'conclusion'].map((key) => [key, text(sections[key], key, 20000)])),
    }
  }
  const batch = text(body.batch, 'Batch', 9, true)
  const [start, end] = batch.split('-').map(Number)
  if (!/^\d{4}-\d{4}$/.test(batch) || start < 1900 || end > 2201 || end !== start + 1) throw httpError(400, 'Batch must be consecutive years, e.g. 2025-2026.')
  if (!['executives', 'mentors', 'alumni', 'volunteers'].includes(body.group)) throw httpError(400, 'Choose a valid member group.')
  return {
    ...common, batch, group: body.group,
    name: text(body.name, 'Name', 120, true), role: text(body.role, 'Role', 160), description: text(body.description, 'Description', 600),
    image: url(body.image, 'Photo', true), instagram: url(body.instagram, 'Instagram'), linkedin: url(body.linkedin, 'LinkedIn'),
  }
}
