import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'

/* eslint-disable react/prop-types */

function AnimatedCounter({ value, suffix = '', prefix = '' }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-15% 0px' })
  const shouldReduceMotion = useReducedMotion()
  const [count, setCount] = useState(shouldReduceMotion ? value : 0)

  useEffect(() => {
    if (!isInView || shouldReduceMotion) return undefined

    let frameId
    const start = performance.now()
    const duration = 1200

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - ((1 - progress) ** 3)
      setCount(Math.round(value * eased))
      if (progress < 1) frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [isInView, shouldReduceMotion, value])

  return <span ref={ref}>{prefix}{count}{suffix}</span>
}

export default AnimatedCounter
