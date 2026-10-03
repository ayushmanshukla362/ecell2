import { useState } from 'react'
import { membersForBatch } from '../components/DataTeam'
import TeamHero from '../components/teams/TeamHero'
import TeamSection from '../components/teams/TeamSection'
import TeamYearSelector from '../components/teams/TeamYearSelector'
import Volunteers from '../components/Volunteers'
import { useContent } from '../content/ContentContext'
import ContentStatus from '../content/ContentStatus'
import { contentBatches } from '../content/contentUtils'

function Teams() {
  const { members, loading, error, retry } = useContent()
  const [requestedBatch, setCurrentTeam] = useState('')
  const batches = contentBatches(members)
  const currentTeam = batches.includes(requestedBatch) ? requestedBatch : batches[0] || ''
  const selectedTeam = membersForBatch(members, currentTeam)

  return (
    <main className="teams-page">
      <TeamHero />
      <section className="teams-intro site-section">
        <p className="eyebrow"><span>01</span> / The collective</p>
        <p>Different strengths, one shared instinct: turn a good thought into a next step. Explore the people shaping E-Cell ABESEC across leadership, departments and the years that came before.</p>
      </section>
      <section id="roster" className="teams-roster site-section">
        <div className="teams-roster__controls">
          <p className="eyebrow"><span>02</span> / Current roster</p>
          <TeamYearSelector years={batches} currentTeam={currentTeam} onChange={setCurrentTeam} />
        </div>
        <ContentStatus loading={loading} error={error} retry={retry} empty={!members.length} emptyMessage="The team roster has not been published yet." />
        {selectedTeam.executives.length > 0 && <TeamSection badge="Leadership / departments" title="The people in the room" members={selectedTeam.executives} groupByHierarchy />}
        {selectedTeam.mentors.length > 0 && <TeamSection badge="Mentors" title="The people who guide us" members={selectedTeam.mentors} />}
        {selectedTeam.alumni.length > 0 && <TeamSection badge="Alumni" title="The people who started it" members={selectedTeam.alumni} />}
        {selectedTeam.volunteers.length > 0 && <Volunteers key={currentTeam} volunteers={selectedTeam.volunteers} />}
      </section>
    </main>
  )
}

export default Teams
