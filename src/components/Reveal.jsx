import { motion, useInView, useReducedMotion } from 'framer-motion'
import { useRef } from 'react'

/* eslint-disable react/prop-types */

function Reveal({ children, className = '', delay = 0, distance = 24 }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-12% 0px' })
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: distance }}
      animate={shouldReduceMotion || isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: distance }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export default Reveal
