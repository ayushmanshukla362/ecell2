import { ArrowUpRight } from 'lucide-react'
import { motion } from 'framer-motion'
import achievementsImage from '../../assets/achievements1.webp'
import challengeImage from '../../assets/achievements2.jpg'
import necImage from '../../assets/nec25.webp'
import AnimatedCounter from '../AnimatedCounter'
import Reveal from '../Reveal'

const metrics = [
  { value: 29, suffix: '', label: 'AIR — National Entrepreneurship Challenge 2024' },
  { value: 27, suffix: '', label: 'AIR — National Entrepreneurship Challenge 2023' },
  { value: 9, suffix: '', label: 'AIR — Western Entrepreneurship Challenge' },
  { value: 20, suffix: '+', label: 'MOUs with different colleges across India' },
  { value: 20, suffix: '+', label: 'Startups incubated' },
]

function AchievementsSection() {
  return (
    <section id="achievements" className="achievement-section" aria-labelledby="achievements-title">
      <div className="achievement-section__top site-section">
        <Reveal>
          <p className="eyebrow eyebrow--dark"><span>02</span> / Proof of work</p>
        </Reveal>
        <div className="achievement-heading">
          <Reveal delay={0.08}>
            <h2 id="achievements-title">Small steps.<br /><em>Real momentum.</em></h2>
          </Reveal>
          <Reveal delay={0.15} className="achievement-heading__copy">
            <p>The work shows up in the rooms we enter, the people we meet and the standards we set for ourselves.</p>
            <span className="achievement-heading__mark">↗</span>
          </Reveal>
        </div>
      </div>

      <div className="achievement-collage site-section">
        <Reveal className="achievement-collage__main">
          <img src={achievementsImage} alt="E-Cell team celebrating at an event" width="1200" height="900" loading="lazy" />
          <span className="image-label image-label--dark">Recognition is a by-product / not the brief</span>
        </Reveal>
        <Reveal delay={0.12} className="achievement-collage__secondary">
          <img src={challengeImage} alt="E-Cell team at an entrepreneurship event" width="1200" height="1600" loading="lazy" />
        </Reveal>
        <Reveal delay={0.2} className="achievement-collage__tertiary">
          <img src={necImage} alt="E-Cell students at National Entrepreneurship Challenge 2025" width="1200" height="900" loading="lazy" />
        </Reveal>
      </div>

      <div className="metrics-wrap site-section">
        <div className="metrics-intro">
          <span>What we&apos;ve built so far</span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </div>
        <div className="metrics-list">
          {metrics.map((metric, index) => (
            <motion.div
              className="metric-row"
              key={metric.label}
              initial={{ opacity: 0, x: -18 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-10% 0px' }}
              transition={{ duration: 0.55, delay: index * 0.06 }}
            >
              <span className="metric-row__number"><AnimatedCounter value={metric.value} suffix={metric.suffix} /></span>
              <span className="metric-row__label">{metric.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default AchievementsSection
