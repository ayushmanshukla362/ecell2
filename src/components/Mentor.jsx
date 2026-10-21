import { ArrowUpRight, Quote } from 'lucide-react'
import { Link } from 'react-router-dom'
import mentorImage from '../assets/sir.png'
import Reveal from './Reveal'

function Mentor() {
  return (
    <section id="mentors" className="site-section mentor-section" aria-labelledby="mentor-title">
      <div className="mentor-section__label">
        <Reveal><p className="eyebrow"><span>05</span> / The perspective</p></Reveal>
        <Reveal delay={0.08}><span className="mentor-section__line" /></Reveal>
      </div>
      <div className="mentor-section__content">
        <Reveal>
          <h2 id="mentor-title">A good idea<br /><em>needs a witness.</em></h2>
        </Reveal>
        <Reveal delay={0.12} className="mentor-quote">
          <div className="mentor-quote__layout">
            <div className="mentor-credit">
              <div className="mentor-credit__image"><img src={mentorImage} alt="Mahendra Kumar Gupta" width="200" height="200" loading="lazy" /></div>
              <div className="mentor-credit__details"><strong>Mahendra Kumar Gupta</strong><span>Faculty Mentor, E-Cell</span></div>
            </div>
            <div className="mentor-quote__copy">
              <Quote className="mentor-quote__icon" size={40} aria-hidden="true" />
              <blockquote>
                “Entrepreneurship is key to job creation and economic growth — especially in countries like ours where nurturing startups and technopreneurs is urgent. At E-CELL, we foster an entrepreneurial mindset through student-led initiatives like E-Summit, workshops, meetups, and more.”
              </blockquote>
            </div>
          </div>
        </Reveal>
        <div className="mentor-section__link">
          <Link to="/contactus#contact-form">Have something in mind? <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  )
}

export default Mentor
