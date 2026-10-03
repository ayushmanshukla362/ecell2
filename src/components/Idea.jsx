import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import MagneticButton from './MagneticButton'
import Reveal from './Reveal'

function Idea() {
  const [email, setEmail] = useState('')

  const handleConnect = (event) => {
    event.preventDefault()
    if (email) window.location.href = `mailto:${email}`
  }

  return (
    <section id="connect" className="cta-section" aria-labelledby="cta-title">
      <div className="cta-section__grid" aria-hidden="true" />
      <div className="cta-section__inner site-section">
        <Reveal><p className="eyebrow eyebrow--dark"><span>07</span> / Your move</p></Reveal>
        <Reveal delay={0.08}>
          <h2 id="cta-title">Make<br /><em>it happen.</em></h2>
        </Reveal>
        <Reveal delay={0.15} className="cta-section__bottom">
          <p>Have an idea in mind? Let&apos;s connect, trade notes and see where it can go.</p>
          <form className="cta-form" onSubmit={handleConnect}>
            <label htmlFor="cta-email" className="sr-only">Your email address</label>
            <input id="cta-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="your@email.com" required />
            <MagneticButton variant="dark" type="submit">Let&apos;s talk</MagneticButton>
          </form>
          <a href="mailto:ecell@abes.ac.in" className="cta-email">Or write to us directly <ArrowUpRight size={16} aria-hidden="true" /></a>
        </Reveal>
      </div>
    </section>
  )
}

export default Idea
