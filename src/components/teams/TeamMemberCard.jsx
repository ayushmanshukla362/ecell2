import { ArrowUpRight } from 'lucide-react'
import { FaInstagram } from 'react-icons/fa6'
import { PiLinkedinLogoBold } from 'react-icons/pi'

/* eslint-disable react/prop-types */

function SocialLink({ href, label, children }) {
  if (!href) return null
  return <a href={href} target="_blank" rel="noreferrer noopener" aria-label={label}>{children}</a>
}

function TeamMemberCard({ member, featured = false }) {
  return (
    <article className={`team-archive-card ${featured ? 'team-archive-card--featured' : ''}`}>
      <div className="team-archive-card__image">
        <img src={member.image || '/placeholder.svg'} alt={member.name} width="500" height="500" loading="lazy" />
        <span>{member.role || 'E-Cell ABESEC'}</span>
      </div>
      <div className="team-archive-card__body">
        <div><h4>{member.name}</h4>{member.description && <p>{member.description}</p>}</div>
        <ArrowUpRight size={17} aria-hidden="true" />
      </div>
      {(member.instagram || member.linkedin) && <div className="team-archive-card__social"><SocialLink href={member.instagram} label={`${member.name} on Instagram`}><FaInstagram aria-hidden="true" /></SocialLink><SocialLink href={member.linkedin} label={`${member.name} on LinkedIn`}><PiLinkedinLogoBold aria-hidden="true" /></SocialLink></div>}
    </article>
  )
}

export default TeamMemberCard
