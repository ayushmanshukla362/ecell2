import { motion, useMotionValue, useSpring } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRef } from 'react'

/* eslint-disable react/prop-types */

function MagneticButton({ to, href, type = 'button', onClick, children, variant = 'dark', className = '' }) {
  const ref = useRef(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 240, damping: 18, mass: 0.35 })
  const springY = useSpring(y, { stiffness: 240, damping: 18, mass: 0.35 })

  const handleMove = (event) => {
    if (!ref.current) return
    const bounds = ref.current.getBoundingClientRect()
    x.set((event.clientX - (bounds.left + bounds.width / 2)) * 0.16)
    y.set((event.clientY - (bounds.top + bounds.height / 2)) * 0.16)
  }

  const reset = () => {
    x.set(0)
    y.set(0)
  }

  const label = (
    <>
      <span>{children}</span>
      <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.8} />
    </>
  )

  return (
    <motion.div
      ref={ref}
      className={`magnetic-button magnetic-button--${variant} ${className}`}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      whileTap={{ scale: 0.97 }}
    >
      {to ? <Link to={to}>{label}</Link> : href ? <a href={href}>{label}</a> : <button type={type} onClick={onClick}>{label}</button>}
    </motion.div>
  )
}

export default MagneticButton
