import { ArrowUpRight } from 'lucide-react'
import { motion } from 'framer-motion'
import aboutImage from '../../assets/aboutUs1.jpg'
import summitImage from '../../assets/aboutUs2.webp'
import Reveal from '../Reveal'

const values = [
  ['01', 'Mindset', 'Creating a dynamic ecosystem where young minds challenge limits and build tomorrow’s enterprises.'],
  ['02', 'Mission', 'Inspire and motivate students to pursue their entrepreneurial dreams.'],
  ['03', 'Vision', 'Create a vibrant and dynamic entrepreneurial culture on campus and beyond.'],
]

function AboutSection() {
  return (
    <section id="about" className="site-section about-section" aria-labelledby="about-title">
      <div className="section-heading section-heading--split">
        <Reveal>
          <p className="eyebrow"><span>01</span> / About E-Cell</p>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 id="about-title">The room where<br /><em>ideas get real.</em></h2>
        </Reveal>
        <Reveal delay={0.14} className="section-heading__aside">
          <p>Entrepreneurship isn&apos;t just a career. It&apos;s a way of thinking that empowers people to identify opportunities, take thoughtful risks and keep learning.</p>
          <a className="text-link" href="#achievements">See our track record <ArrowUpRight size={16} aria-hidden="true" /></a>
        </Reveal>
      </div>

      <div className="about-story">
        <Reveal className="about-story__image about-story__image--large">
          <div className="image-frame">
            <img src={aboutImage} alt="E-Cell students at National Technology Day 2025" width="2000" height="1333" loading="lazy" />
            <span className="image-label">A community in motion / 2025</span>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="about-story__copy">
          <p className="story-index">A—01</p>
          <p>At the Entrepreneurship Cell of ABES Engineering College, we&apos;re a vibrant community of student innovators driven by curiosity, ambition and a shared passion for turning ideas into impact.</p>
          <p>Founded and run entirely by students, we grow from casual brainstorming sessions in campus cafes to large-scale pitching events. Mentorship programmes, workshops and speaker sessions make space for every member to be bold, collaborative and proactive.</p>
          <div className="about-story__mini-image">
            <img src={summitImage} alt="E-Cell students at an entrepreneurship summit" width="1600" height="2133" loading="lazy" />
            <span>Learning by doing</span>
          </div>
        </Reveal>
      </div>

      <div className="values-list" aria-label="Our principles">
        {values.map(([number, title, description], index) => (
          <motion.article
            key={title}
            className="value-row"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10% 0px' }}
            transition={{ duration: 0.38, delay: index * 0.05 }}
          >
            <span className="value-row__number">{number}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </motion.article>
        ))}
      </div>
    </section>
  )
}

export default AboutSection
