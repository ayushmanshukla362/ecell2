import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Quote } from 'lucide-react'
import { useState } from 'react'
import dg from '../assets/dg.webp'
import founder from '../assets/founder.jpg'
import president from '../assets/president.webp'
import np from '../assets/np.jpg'
import sa from '../assets/sa.jpg'
import kaa from '../assets/kaa.webp'
import Reveal from './Reveal'

const testimonials = [
  { quote: 'E-Cell ABESEC holds a special place in my heart, from chaotic first events to conducting a drone show and reaching NEC 2023 finals. Guided by Mahendra Sir and Prabansh Sir, it fostered growth, teamwork, and unforgettable memories.', image: dg, name: 'Divyanshyu Gupta', role: 'Mentor' },
  { quote: 'E-Cell ABESEC guided my growth from volunteer to Tech-Ops Coordinator, highlighted by launching the first live website, fostering professional and personal development under inspiring mentorship.', image: np, name: 'Neelansh Pandey', role: 'Former Tech-Ops Coordinator, E-CELL ABESEC' },
  { quote: 'E-Cell ABESEC guided my growth from volunteer to Social Media Coordinator, fostering personal and professional development through impactful events and lasting relationships under inspiring mentorship.', image: sa, name: 'Shoaib Ahmad', role: 'Former Social Media Coordinator, E-CELL ABESEC' },
  { quote: 'E-Cell ABESEC shaped my journey from volunteer to Vice President, boosting female participation by 30%, enhancing leadership skills, and building confidence while leaving a lasting legacy.', image: kaa, name: 'Kamakshi Agarwal', role: 'Former Vice President' },
  { quote: 'E-Cell ABESEC holds a special place in my heart, from chaotic first events to conducting an E-SUMMIT, reaching NEC 2023 finals, and achieving AIR 27.', image: president, name: 'Yash Mishra', role: 'Former NEC Lead and President E-CELL ABESEC' },
  { quote: "Founding E-CELL ABESEC was a journey of vision, perseverance, and teamwork. With Mahendra Sir's guidance, we built a platform to foster innovation and inspire future entrepreneurs.", image: founder, name: 'Prabhansh Tripathi', role: 'Founder' },
]

function Testimonial() {
  const [activeIndex, setActiveIndex] = useState(0)
  const active = testimonials[activeIndex]
  const change = (direction) => setActiveIndex((current) => (current + direction + testimonials.length) % testimonials.length)

  return (
    <section className="voice-section site-section" aria-labelledby="voice-title">
      <div className="voice-section__top">
        <Reveal><p className="eyebrow"><span>06</span> / In their words</p></Reveal>
        <Reveal delay={0.08}><h2 id="voice-title">You don&apos;t leave<br /><em>the same.</em></h2></Reveal>
        <Reveal delay={0.14} className="voice-section__controls">
          <button type="button" aria-label="Previous testimonial" onClick={() => change(-1)}><ArrowLeft size={18} /></button>
          <span>{String(activeIndex + 1).padStart(2, '0')} / {String(testimonials.length).padStart(2, '0')}</span>
          <button type="button" aria-label="Next testimonial" onClick={() => change(1)}><ArrowRight size={18} /></button>
        </Reveal>
      </div>
      <div className="voice-section__body">
        <div className="voice-section__portrait"><AnimatePresence mode="wait"><motion.img key={active.name} src={active.image} alt={active.name} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} /></AnimatePresence></div>
        <div className="voice-section__quote"><Quote size={36} strokeWidth={1} aria-hidden="true" /><AnimatePresence mode="wait"><motion.blockquote key={active.name} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.35 }}>{active.quote}</motion.blockquote></AnimatePresence><div className="voice-section__credit"><strong>{active.name}</strong><span>{active.role}</span></div></div>
      </div>
    </section>
  )
}

export default Testimonial
