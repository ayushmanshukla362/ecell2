import { MEMBER_GROUPS, STORY_FIELDS } from './contentUtils.js'

const lines = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean)
const text = (value) => String(value ?? '').trim()

export function contentFormValues(collection, item = {}) {
  const currentYear = new Date().getFullYear()
  const common = { image: '', featured: false, order: 0, ...item }
  if (collection === 'members') return {
    name: '', role: '', description: '', instagram: '', linkedin: '', batch: `${currentYear}-${currentYear + 1}`, group: 'executives', ...common,
  }
  return {
    title: '', date: '', year: currentYear, category: '', shortDescription: '', venue: '', registrationUrl: '', listingImage: '', ...common,
    speakers: (item.speakers || []).join('\n'), highlights: (item.highlights || []).join('\n'), images: (item.images || []).join('\n'),
    ...Object.fromEntries(STORY_FIELDS.map((field) => [field, item.descriptionSections?.[field] || ''])),
  }
}

export function isContentUrl(value, allowLocal = false) {
  if (!value) return true
  if (value.includes('\\') || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false
  if (allowLocal && value.startsWith('/') && !value.startsWith('//')) return true
  if (!value.startsWith('https://')) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

export function validateContentForm(collection, values) {
  const errors = {}
  const member = collection === 'members'
  const limits = member
    ? { name: 120, role: 160, description: 600 }
    : { title: 160, date: 100, category: 100, shortDescription: 600, venue: 200 }
  for (const [field, limit] of Object.entries(limits)) {
    if (text(values[field]).length > limit) errors[field] = `Use no more than ${limit} characters.`
  }
  for (const field of member ? ['name', 'batch'] : ['title', 'date', 'year']) {
    if (!text(values[field])) errors[field] = 'This field is required.'
  }
  for (const [field, min, max] of member ? [['order', 0, 10000]] : [['order', 0, 10000], ['year', 1900, 2200]]) {
    const value = Number(values[field])
    if (!text(values[field]) || !Number.isInteger(value) || value < min || value > max) errors[field] = `Enter a whole number from ${min} to ${max}.`
  }
  if (member) {
    const match = /^(\d{4})-(\d{4})$/.exec(text(values.batch))
    if (!match || Number(match[2]) !== Number(match[1]) + 1) errors.batch = 'Use consecutive years, for example 2025-2026.'
    if (!MEMBER_GROUPS.includes(values.group)) errors.group = 'Choose a valid member group.'
  }
  for (const field of member ? ['image', 'instagram', 'linkedin'] : ['image', 'listingImage', 'registrationUrl']) {
    const image = field === 'image' || field === 'listingImage'
    if (!isContentUrl(text(values[field]), image)) errors[field] = image ? 'Use an https:// URL or a local /path (not //).' : 'Use an https:// URL.'
  }
  if (!member && lines(values.images).some((url) => !isContentUrl(url, true))) errors.images = 'Each line must be an https:// URL or a local /path (not //).'
  return errors
}

export function contentPayload(collection, values) {
  const common = { image: text(values.image), featured: Boolean(values.featured), order: Number(values.order) }
  if (collection === 'members') return {
    ...Object.fromEntries(['name', 'role', 'description', 'instagram', 'linkedin', 'batch', 'group'].map((field) => [field, text(values[field])])), ...common,
  }
  return {
    ...Object.fromEntries(['title', 'date', 'category', 'shortDescription', 'venue', 'registrationUrl', 'listingImage'].map((field) => [field, text(values[field])])),
    ...common, year: Number(values.year), speakers: lines(values.speakers), highlights: lines(values.highlights), images: lines(values.images),
    descriptionSections: Object.fromEntries(STORY_FIELDS.map((field) => [field, text(values[field])])),
  }
}
