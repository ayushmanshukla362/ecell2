import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <main className="not-found-page site-section" aria-labelledby="not-found-title">
      <p className="eyebrow"><span>404</span> / Page not found</p>
      <h1 id="not-found-title">This page isn&apos;t here.</h1>
      <p>The link may be out of date or the address may be incorrect. Let&apos;s get you back to E-Cell.</p>
      <div className="not-found-page__links">
        <Link className="text-link" to="/">Back to home ↗</Link>
        <Link className="text-link" to="/events">Explore events ↗</Link>
        <Link className="text-link" to="/contactus#contact-form">Contact us ↗</Link>
      </div>
    </main>
  )
}

export default NotFound
