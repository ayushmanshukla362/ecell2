export const PLACEHOLDER_IMAGE = '/content-assets/placeholder.svg'
export const MEMBER_GROUPS = ['executives', 'mentors', 'alumni', 'volunteers']
export const STORY_FIELDS = ['about', 'vision', 'callout', 'review', 'conclusion']
export const EVENT_TYPES = ['event', 'session']
export const EVENT_TYPE_LABELS = { event: 'Event', session: 'Session' }

export const eventTypeLabel = (type) => EVENT_TYPE_LABELS[type] || EVENT_TYPE_LABELS.event

// Explicit order wins; ties remain deterministic across requests and views.
export function compareContent(left, right) {
  return (Number(left.order) || 0) - (Number(right.order) || 0)
    || (left.name || left.title || '').localeCompare(right.name || right.title || '')
    || String(left.id).localeCompare(String(right.id))
}

export const contentYears = (events) => [...new Set(events.map((event) => String(event.year)))].sort((a, b) => Number(b) - Number(a))
export const contentBatches = (members) => [...new Set(members.map((member) => member.batch))].sort().reverse()
