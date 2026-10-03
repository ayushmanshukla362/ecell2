import { useState } from 'react'
import { teamData } from '../components/DataTeam'
import TeamHero from '../components/teams/TeamHero'
import TeamSection from '../components/teams/TeamSection'
import TeamYearSelector from '../components/teams/TeamYearSelector'
import Volunteers from '../components/Volunteers'

const TEAM_YEARS = ['2024-2025', '2025-2026']

function Teams() {
  const [currentTeam, setCurrentTeam] = useState('2025-2026')
  const selectedTeam = teamData[currentTeam]

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
          <TeamYearSelector years={TEAM_YEARS} currentTeam={currentTeam} onChange={setCurrentTeam} />
        </div>
        <TeamSection badge="Leadership / departments" title="The people in the room" members={selectedTeam.executives} groupByHierarchy />
        <TeamSection badge="Mentors" title="The people who guide us" members={selectedTeam.mentors} />
        <TeamSection badge="Alumni" title="The people who started it" members={selectedTeam.alumni} />
        <Volunteers currentTeam={currentTeam} />
      </section>
    </main>
  )
}

export default Teams
