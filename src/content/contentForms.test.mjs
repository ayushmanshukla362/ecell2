import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { contentFormValues, contentPayload, isContentUrl, validateContentForm } from './contentForms.js'
import { compareContent, contentBatches, contentYears } from './contentUtils.js'
import { createEventSlug, findEventBySlug } from '../components/EventsData.js'

const seed = JSON.parse(await readFile(new URL('../../backend/seed-content.json', import.meta.url), 'utf8'))

test('every migrated record is editable without losing story, gallery or feature settings', () => {
  for (const collection of ['events', 'members']) {
    for (const item of seed[collection]) {
      const values = contentFormValues(collection, item)
      assert.deepEqual(validateContentForm(collection, values), {}, item.id)
      const payload = contentPayload(collection, values)
      assert(!('id' in payload), 'the server owns IDs')
      assert.equal(payload.featured, item.featured)
      assert.equal(payload.order, item.order)
      if (collection === 'events') {
        assert.deepEqual(payload.images, item.images)
        for (const [name, value] of Object.entries(item.descriptionSections)) assert.equal(payload.descriptionSections[name], value.trim())
      }
    }
  }
})

test('seed preserves featured IDs and leadership without marking volunteers featured', () => {
  assert.deepEqual(seed.events.filter((item) => item.featured).sort(compareContent).map((item) => item.id), ['13', '12', '10'])
  const featured = seed.members.filter((item) => item.featured).sort(compareContent)
  assert.equal(featured.length, 4)
  assert(featured.every((item) => item.batch === '2025-2026' && item.group === 'executives'))
})

test('required fields, numeric boundaries and consecutive batches are validated', () => {
  const event = contentFormValues('events')
  assert.deepEqual(Object.keys(validateContentForm('events', event)).sort(), ['date', 'title'])
  Object.assign(event, { title: 'Launch', date: 'March 1', year: 1899, order: 0.5 })
  assert.deepEqual(Object.keys(validateContentForm('events', event)).sort(), ['order', 'year'])
  Object.assign(event, { year: 2200, order: 10000 })
  assert.deepEqual(validateContentForm('events', event), {})
  Object.assign(event, { title: 'x'.repeat(161), shortDescription: 'x'.repeat(601), order: '' })
  assert.deepEqual(Object.keys(validateContentForm('events', event)).sort(), ['order', 'shortDescription', 'title'])
  const member = contentFormValues('members', { name: 'Test', batch: '2025-2027', group: 'unknown' })
  assert.deepEqual(Object.keys(validateContentForm('members', member)).sort(), ['batch', 'group'])
})

test('images accept only local roots or HTTPS; social and registration links require HTTPS', () => {
  for (const bad of ['javascript:alert(1)', '//evil.test/image', 'http://example.com', '/\\evil.test', '/a\nb', 'https://user:password@example.com']) assert.equal(isContentUrl(bad, true), false, bad)
  for (const good of ['', '/content-assets/a.webp', 'https://example.com/a.png']) assert.equal(isContentUrl(good, true), true, good)
  assert.equal(isContentUrl('/local', false), false)
  const event = contentFormValues('events', { title: 'Test', date: 'Tomorrow', images: ['https://example.com/a', '//evil.test/b'] })
  assert.equal(typeof validateContentForm('events', event).images, 'string')
})

test('multiline form fields serialize arrays, clear fields and retain zero values', () => {
  const values = contentFormValues('events', { title: ' Event ', date: ' Soon ', order: 0, featured: false })
  Object.assign(values, { speakers: 'Ada\n\nGrace\n', highlights: 'Launch\n Q&A ', images: '/a.webp\nhttps://example.com/b.webp', about: ' Story\nSecond line ' })
  const item = contentPayload('events', values)
  assert.deepEqual(item.speakers, ['Ada', 'Grace'])
  assert.deepEqual(item.highlights, ['Launch', 'Q&A'])
  assert.deepEqual(item.images, ['/a.webp', 'https://example.com/b.webp'])
  assert.equal(item.descriptionSections.about, 'Story\nSecond line')
  assert.equal(item.descriptionSections.review, '')
  assert.equal(item.featured, false)
  assert.equal(item.order, 0)
})

test('sorting and selectors use available content, including empty collections', () => {
  const items = [{ id: 'b', title: 'Beta', order: 0, year: 2031 }, { id: 'a', title: 'Alpha', order: 0, year: 2030 }, { id: 'c', title: 'First', order: 1, year: 2031 }]
  assert.deepEqual([...items].sort(compareContent).map((item) => item.id), ['a', 'b', 'c'])
  assert.deepEqual(contentYears(items), ['2031', '2030'])
  assert.deepEqual(contentYears([]), [])
  assert.deepEqual(contentBatches([{ batch: '2030-2031' }, { batch: '2020-2021' }]), ['2030-2031', '2020-2021'])
  assert.deepEqual(contentBatches([]), [])
  assert.deepEqual(items.filter((item) => item.featured), [])
})

test('historical event slugs and Navy Visit alias survive API migration, not deletion', () => {
  for (const event of seed.events) assert.equal(findEventBySlug(seed.events, createEventSlug(event.title)).id, event.id)
  assert.equal(findEventBySlug([{ id: '2', title: 'Updated visit' }], 'navy-visit-2023').id, '2')
  assert.equal(findEventBySlug([], 'navy-visit-2023'), undefined)
  assert.equal(createEventSlug('Event (4.0) – 2026'), 'event-(4.0)-–-2026')
})
