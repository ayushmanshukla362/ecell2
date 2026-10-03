import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import logo from '../assets/ecell.svg'

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__top site-section">
        <div className="site-footer__brand">
          <Link to="/" aria-label="E-Cell ABESEC home"><img src={logo} alt="E-Cell ABESEC" /></Link>
          <p>Experience entrepreneurship<br />with us.</p>
        </div>
        <div className="site-footer__nav">
          <span className="footer-label">Explore</span>
          <Link to="/">Home</Link>
          <Link to="/teams">Team</Link>
          <Link to="/events">Events</Link>
          <Link to="/contactus">Contact</Link>
        </div>
        <div className="site-footer__contact">
          <span className="footer-label">Say hello</span>
          <a href="mailto:ecell@abes.ac.in">ecell@abes.ac.in <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="https://www.instagram.com/ecell_abesec/" target="_blank" rel="noreferrer">Instagram <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="https://www.linkedin.com/company/ecell-abes-ec/mycompany/" target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
      </div>
      <div className="site-footer__bottom site-section">
        <span>© 2025 E-Cell ABESEC</span>
        <span>From ideas to imprint <span className="footer-dot" /></span>
      </div>
    </footer>
  )
}

export default Footer
