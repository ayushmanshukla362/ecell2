import ContactHeader from './contact/ContactHeader'
import ContactForm from './contact/ContactForm'
import ContactChannels from './contact/ContactChannels'
import ContactMap from './contact/ContactMap'

function ContactUs() {
  return (
    <main className="contact-page" aria-labelledby="contact-title">
      <div className="site-section">
        <ContactHeader />
        <section className="contact-grid">
          <div className="contact-grid__copy">
            <p className="eyebrow"><span>01</span> / Start here</p>
            <h2>Good things<br /><em>start with hello.</em></h2>
            <p>Share what you&apos;re working on, ask a question or simply say hello. Our team would love to hear from you.</p>
            <ContactChannels />
          </div>
          <div className="contact-form-panel"><ContactForm /></div>
        </section>
        <section className="contact-map-panel"><ContactMap /></section>
      </div>
    </main>
  )
}

export default ContactUs
