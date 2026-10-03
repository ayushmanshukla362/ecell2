import { Menu, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import logo from '../assets/ecell.svg'
import { useAuth } from '../auth/AuthContext'

const pageLinks = [
  { label: 'Home', to: '/' },
  { label: 'Team', to: '/teams' },
  { label: 'Events', to: '/events' },
  { label: 'Contact', to: '/contactus' },
]

function Navbar() {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const lastScroll = useRef(0)
  const menuToggle = useRef(null)
  const location = useLocation()
  const accountPath = user ? '/account' : '/signin'

  useEffect(() => {
    const onScroll = () => {
      const currentScroll = window.scrollY
      setIsVisible(currentScroll < 80 || currentScroll < lastScroll.current)
      lastScroll.current = currentScroll
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setIsOpen(false)
    setIsVisible(true)
  }, [location.key])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        menuToggle.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  return (
    <header className={`site-nav ${isVisible || isOpen ? 'site-nav--visible' : 'site-nav--hidden'}`}>
      <div className="site-nav__inner">
        <Link to="/" className="site-nav__brand" aria-label="E-Cell ABESEC home">
          <img src={logo} alt="E-Cell ABESEC" />
          <span>ABES<br /><small>Engineering College</small></span>
        </Link>

        <nav id="primary-navigation" className={`site-nav__links ${isOpen ? 'site-nav__links--open' : ''}`} aria-label="Primary navigation">
          {pageLinks.map((item) => (
            <Link key={item.to} to={item.to} aria-current={location.pathname === item.to ? 'page' : undefined} className={location.pathname === item.to ? 'is-active' : ''}>{item.label}</Link>
          ))}
          {user?.isAdmin && <Link to="/admin" aria-current={location.pathname === '/admin' ? 'page' : undefined} className={location.pathname === '/admin' ? 'is-active' : ''}>Admin</Link>}
        </nav>

        <Link className="site-nav__cta" to={accountPath} aria-current={location.pathname === accountPath ? 'page' : undefined}>{user ? 'Account' : 'Sign in'} <span aria-hidden="true">↗</span></Link>
        <button ref={menuToggle} className="site-nav__toggle" type="button" aria-label={isOpen ? 'Close menu' : 'Open menu'} aria-controls="primary-navigation" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
          {isOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
}

export default Navbar
