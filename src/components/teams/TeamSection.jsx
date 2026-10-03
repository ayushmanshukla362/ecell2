import { ArrowUpRight } from 'lucide-react'
import Reveal from '../Reveal'
import TeamMemberCard from './TeamMemberCard'

/* eslint-disable react/prop-types */

const HIERARCHY_LABELS = ['Faculty/Leadership', 'President/Head', 'Vice President', 'Core Team', 'Domain/Department Leads', 'Coordinators', 'Team Members', 'Existing Roles']

function hierarchyForRole(role = '') {
  const normalizedRole = role.toLowerCase()
  if (normalizedRole.includes('vice') && normalizedRole.includes('president')) return 'Vice President'
  if (normalizedRole.includes('faculty')) return 'Faculty/Leadership'
  if (normalizedRole.includes('president') || normalizedRole.includes('head')) return 'President/Head'
  if (normalizedRole.includes('lead') || normalizedRole.includes('treasurer')) return 'Domain/Department Leads'
  if (normalizedRole.includes('coordinator')) return 'Coordinators'
  if (normalizedRole.includes('core')) return 'Core Team'
  if (normalizedRole.includes('member')) return 'Team Members'
  return 'Existing Roles'
}

function groupMembers(members) {
  return members.reduce((groups, member) => {
    const group = hierarchyForRole(member.role)
    groups[group] = groups[group] || []
    groups[group].push(member)
    return groups
  }, {})
}

function TeamSection({ badge, title, members = [], groupByHierarchy = false }) {
  const groups = groupByHierarchy ? groupMembers(members) : { Members: members }

  return (
    <section className="team-section" aria-labelledby={`${badge.replace(/\W+/g, '-').toLowerCase()}-title`}>
      <Reveal className="team-section__heading">
        <div><p className="eyebrow"><span>—</span> / {badge}</p><h2 id={`${badge.replace(/\W+/g, '-').toLowerCase()}-title`}>{title}</h2></div>
        <ArrowUpRight size={22} aria-hidden="true" />
      </Reveal>
      <div className="team-groups">
        {HIERARCHY_LABELS.concat('Members').filter((label) => groups[label]?.length).map((label) => (
          <div className="team-group" key={label}>
            {groupByHierarchy && <h3>{label}</h3>}
            <div className="team-archive-grid">
              {groups[label].map((member, index) => <TeamMemberCard key={`${member.name}-${index}`} member={member} featured={label === 'President/Head'} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default TeamSection
