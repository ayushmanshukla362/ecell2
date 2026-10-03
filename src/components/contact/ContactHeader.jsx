import Reveal from '../Reveal'

function ContactHeader() {
  return (
    <header className="contact-header">
      <Reveal><p className="eyebrow"><span>00</span> / Contact E-Cell</p></Reveal>
      <Reveal delay={0.08}><h1 id="contact-title">Reach us<br /><em>here.</em></h1></Reveal>
    </header>
  )
}

export default ContactHeader
