// One-time migration of the original trusted local arrays. After migration, the
// checked-in seed is the canonical snapshot: reruns reproduce it and its assets.
// This script never opens or overwrites the live content database.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const seedPath = resolve(root, 'backend/seed-content.json')
const assetsRoot = resolve(root, 'src/assets')
const publicRoot = resolve(root, 'public/content-assets')

async function originalData(file, start, end, variable) {
  const source = await readFile(resolve(root, file), 'utf8')
  const bindings = {}
  for (const match of source.matchAll(/import\s+(\w+)\s+from\s+["'](\.\.\/assets\/[^"']+)["']/g)) {
    const asset = resolve(dirname(resolve(root, file)), match[2])
    const path = relative(assetsRoot, asset).split(sep).map(encodeURIComponent).join('/')
    bindings[match[1]] = `/content-assets/${path}`
  }
  const first = source.indexOf(start)
  const last = source.indexOf(end, first)
  if (first < 0 || last < 0) throw new Error(`Original content no longer exists in ${file}; restore the checked-in seed instead.`)
  const declaration = source.slice(first, last).replace(/^export /, '')
  return vm.runInNewContext(`${declaration}\nJSON.parse(JSON.stringify(${variable}))`, bindings, { timeout: 1000 })
}

const slug = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
let seed
try {
  seed = JSON.parse(await readFile(seedPath, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  const events = await originalData('src/components/EventsData.js', 'const events =', 'export const createEventSlug', 'events')
  const teams = await originalData('src/components/DataTeam.jsx', 'export const teamData =', '// Section titles', 'teamData')
  const volunteers = await originalData('src/components/Volunteers.jsx', 'const volunteersData =', 'function Volunteers', 'volunteersData')
  const featuredIds = [13, 12, 10]
  seed = {
    events: events.map((event, index) => ({
      ...event,
      id: String(event.id),
      listingImage: event.listingImage || '',
      images: event.images || [],
      featured: featuredIds.includes(event.id),
      order: featuredIds.includes(event.id) ? featuredIds.indexOf(event.id) : index + 3,
    })),
    members: Object.entries(teams).flatMap(([batch, groups]) => Object.entries(groups).flatMap(([group, members]) => members.map((member, index) => ({
      ...member,
      id: `${batch}-${group}-${index + 1}-${slug(member.name)}`,
      description: member.description || '',
      batch,
      group,
      featured: batch === '2025-2026' && group === 'executives' && index < 4,
      order: index,
    })))).concat(Object.entries(volunteers).flatMap(([batch, members]) => members.map(([name, role], index) => ({
      id: `${batch}-volunteers-${index + 1}-${slug(name)}`,
      name, role, batch, group: 'volunteers', description: '', image: '', instagram: '', linkedin: '', featured: false, order: index,
    })))),
  }
}

const assetUrls = new Set()
for (const item of [...seed.events, ...seed.members]) {
  for (const url of [item.image, item.listingImage, ...(item.images || [])]) {
    if (url?.startsWith('/content-assets/')) assetUrls.add(url)
  }
}
for (const url of assetUrls) {
  const path = decodeURIComponent(url.slice('/content-assets/'.length))
  const source = resolve(assetsRoot, path)
  const destination = resolve(publicRoot, path)
  if (!source.startsWith(`${assetsRoot}${sep}`) || !destination.startsWith(`${publicRoot}${sep}`)) throw new Error('Invalid asset path')
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(source, destination)
}
await mkdir(dirname(seedPath), { recursive: true })
await writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`)
console.log(`Exported ${seed.events.length} events, ${seed.members.length} members, ${assetUrls.size} assets. Live database untouched.`)
