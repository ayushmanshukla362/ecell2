import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { teamData } from '../DataTeam'
import Reveal from '../Reveal'

function TeamPreviewSection() {
  const team = teamData['2025-2026'].executives
  const lead = team[0]
  const supportingMembers = team.slice(1, 4)

  return (
    <section id="team" className="site-section team-preview" aria-labelledby="team-preview-title">
      <div className="team-preview__intro">
        <Reveal>
          <p className="eyebrow"><span>04</span> / The people</p>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 id="team-preview-title">No spectators<br /><em>in this room.</em></h2>
        </Reveal>
        <Reveal delay={0.14} className="team-preview__aside">
          <p>A student-led team, shaped by different departments and one shared instinct: to move an idea forward.</p>
          <Link className="text-link" to="/teams">Meet the full team <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </Reveal>
      </div>

      <div className="team-preview__layout">
        <Reveal className="team-lead">
          <div className="team-portrait team-portrait--lead">
            <img src={lead.image} alt={lead.name} width="600" height="600" loading="lazy" />
            <span className="team-portrait__index">01</span>
          </div>
          <div className="team-person-line">
            <div><h3>{lead.name}</h3><p>{lead.role}</p></div>
            <ArrowUpRight size={18} aria-hidden="true" />
          </div>
        </Reveal>

        <div className="team-supporting">
          {supportingMembers.map((member, index) => (
            <Reveal key={member.name} delay={0.08 + index * 0.07} className="team-supporting__member">
              <div className="team-portrait">
                <img src={member.image} alt={member.name} width="500" height="500" loading="lazy" />
                <span className="team-portrait__index">0{index + 2}</span>
              </div>
              <div className="team-person-line">
                <div><h3>{member.name}</h3><p>{member.role}</p></div>
                <ArrowUpRight size={16} aria-hidden="true" />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export default TeamPreviewSection
