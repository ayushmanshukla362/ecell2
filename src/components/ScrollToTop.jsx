import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useContent } from '../content/ContentContext'

function ScrollToTop() {
  const { pathname, hash, key } = useLocation()
  const { loading } = useContent()
  const waitingForContent = Boolean(hash) && loading

  useEffect(() => {
    if (waitingForContent) return
    let id = hash.slice(1)
    try { id = decodeURIComponent(id) } catch { /* Malformed hashes must not break navigation. */ }
    let frame, timer, stopped = false
    let resizeObserver, mutationObserver
    const stop = () => {
      stopped = true
      window.cancelAnimationFrame(frame)
      clearTimeout(timer)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', onKey)
    }
    const onKey = (event) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) stop() }
    const align = () => {
      if (stopped) return
      const target = id ? document.getElementById(id) : null
      if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' })
      else window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(align)
    }
    schedule()
    if (id) {
      // AnimatePresence swaps the archive grid AFTER the API loading flag clears.
      // Keep the anchor aligned through that short layout transition, but never
      // fight a user's scroll or keep observing for the entire page lifetime.
      const main = document.querySelector('main')
      if (main) {
        resizeObserver = new ResizeObserver(schedule)
        resizeObserver.observe(main)
        mutationObserver = new MutationObserver(schedule)
        mutationObserver.observe(main, { childList: true, subtree: true })
      }
      window.addEventListener('wheel', stop, { passive: true })
      window.addEventListener('touchstart', stop, { passive: true })
      window.addEventListener('keydown', onKey)
      timer = setTimeout(stop, 2500)
    }
    return stop
  }, [pathname, hash, key, waitingForContent])

  return null
}

export default ScrollToTop
