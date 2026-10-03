import { Menu, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import logo from '../assets/ecell.svg'

const pageLinks = [
  { label: 'Home', to: '/' },
  { label: 'Team', to: '/teams' },
  { label: 'Events', to: '/events' },
  { label: 'Contact', to: '/contactus' },
]

function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const lastScroll = useRef(0)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => {
      const currentScroll = window.scrollY
      setIsVisible(currentScroll < 80 || currentScroll < lastScroll.current)
      lastScroll.current = currentScroll
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setIsOpen(false), [location.pathname])

  return (
    <header className={`site-nav ${isVisible ? 'site-nav--visible' : 'site-nav--hidden'}`}>
      <div className="site-nav__inner">
        <Link to="/" className="site-nav__brand" aria-label="E-Cell ABESEC home">
          <img src={logo} alt="E-Cell ABESEC" />
          <span>ABES<br /><small>Engineering College</small></span>
        </Link>

        <nav className={`site-nav__links ${isOpen ? 'site-nav__links--open' : ''}`} aria-label="Primary navigation">
          {pageLinks.map((item) => (
            <Link key={item.to} to={item.to} className={location.pathname === item.to ? 'is-active' : ''}>{item.label}</Link>
          ))}
        </nav>

        <a className="site-nav__cta" href="/#connect">Start a conversation <span>↗</span></a>
        <button className="site-nav__toggle" type="button" aria-label={isOpen ? 'Close menu' : 'Open menu'} aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
          {isOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
}

export default Navbar
