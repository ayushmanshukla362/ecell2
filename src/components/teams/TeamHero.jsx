import { ArrowDown } from 'lucide-react'
import Reveal from '../Reveal'

function TeamHero() {
  return (
    <section className="teams-hero" aria-labelledby="teams-hero-title">
      <div className="teams-hero__grid" aria-hidden="true" />
      <div className="site-section teams-hero__inner">
        <Reveal><p className="eyebrow"><span>00</span> / The collective</p></Reveal>
        <Reveal delay={0.08}><h1 id="teams-hero-title">Built by<br /><em>the curious.</em></h1></Reveal>
        <Reveal delay={0.16} className="teams-hero__bottom"><p>Student leadership, mentors and alumni — the people behind the work at E-Cell ABES Engineering College.</p><a href="#roster" aria-label="Scroll to team roster"><ArrowDown size={18} aria-hidden="true" /></a></Reveal>
      </div>
    </section>
  )
}

export default TeamHero
