import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRef } from 'react'
import heroImage from '../../assets/aboutUs2.webp'
import logo from '../../assets/ecell.svg'
import MagneticButton from '../MagneticButton'

function HeroSection() {
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const imageY = useTransform(scrollYProgress, [0, 1], [0, 100])
  const shouldReduceMotion = useReducedMotion()

  return (
    <section ref={heroRef} className="site-hero" aria-labelledby="hero-title">
      <div className="hero-grid" aria-hidden="true" />
      <motion.div
        className="hero-orbit hero-orbit--one"
        aria-hidden="true"
        animate={shouldReduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="hero-orbit hero-orbit--two"
        aria-hidden="true"
        animate={shouldReduceMotion ? undefined : { rotate: -360 }}
        transition={{ duration: 38, repeat: Infinity, ease: 'linear' }}
      />

      <div className="hero-frame">
        <div className="hero-kicker">
          <span className="hero-kicker__line" />
          <span>Entrepreneurship Cell / ABES Engineering College</span>
          {/* <span className="hero-kicker__year">25—26</span> */}
        </div>

        <div className="hero-layout">
          <div className="hero-copy">
            <motion.p
              className="eyebrow hero-eyebrow"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, delay: 0.08 }}
            >
              Student-led. Future-facing.
            </motion.p>
            <motion.h1
              id="hero-title"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
            >
              <span>E-Cell</span>
              <span className="hero-title__accent">ABES</span>
              <span>Engineering</span>
              <span className="hero-title__outline">College</span>
            </motion.h1>
            <motion.div
              className="hero-tagline"
              initial={shouldReduceMotion ? false : { opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.28 }}
            >
              <span>From Ideas</span>
              <span className="hero-tagline__arrow">→</span>
              <span>to Imprint</span>
            </motion.div>
            <motion.p
              className="hero-description"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.45, delay: 0.38 }}
            >
              A community of student innovators building the confidence, connections and curiosity to make ideas matter.
            </motion.p>
            <motion.div
              className="hero-actions"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, delay: 0.48 }}
            >
              <MagneticButton to="/events" variant="yellow">Explore our work</MagneticButton>
              <Link className="text-link" to="/teams">
                Meet the people <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </motion.div>
          </div>

          <div className="hero-visual">
            <motion.div className="hero-image-wrap" style={{ y: shouldReduceMotion ? 0 : imageY }}>
              <img src={heroImage} alt="E-Cell ABES students at E-Summit 2025" className="hero-image" width="1200" height="1600" fetchPriority="high" decoding="async" />
              <div className="hero-image-wash" aria-hidden="true" />
            </motion.div>
            <div className="hero-stamp" aria-hidden="true">
              <img src={logo} alt="" />
              <span>Ideas<br />into<br />impact</span>
            </div>
          </div>
        </div>

        <a href="#about" className="hero-scroll" aria-label="Scroll to About section">
          <span>Scroll to explore</span>
          <ArrowDown size={16} aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}

export default HeroSection
