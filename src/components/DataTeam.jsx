import { compareContent, MEMBER_GROUPS, PLACEHOLDER_IMAGE } from '../content/contentUtils'

// Group API records for the existing roster layout; never substitute seed data.
export function membersForBatch(members, batch) {
  return Object.fromEntries(MEMBER_GROUPS.map((group) => [group, members
    .filter((member) => member.batch === batch && member.group === group)
    .sort(compareContent)
    .map((member) => ({ ...member, image: member.image || PLACEHOLDER_IMAGE }))]))
}
