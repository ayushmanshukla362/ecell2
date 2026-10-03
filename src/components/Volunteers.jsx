import { useState } from 'react'

/* eslint-disable react/prop-types */

function Volunteers({ volunteers = [] }) {
  const [requestedRole, setSelectedRole] = useState('All')
  const roles = ['All', ...new Set(volunteers.map((member) => member.role).filter(Boolean))]
  const selectedRole = roles.includes(requestedRole) ? requestedRole : 'All'
  const visibleVolunteers = selectedRole === 'All' ? volunteers : volunteers.filter((member) => member.role === selectedRole)

  return (
    <section className="volunteer-section" aria-labelledby="volunteer-title">
      <div className="volunteer-section__heading">
        <div><p className="eyebrow"><span>—</span> / Volunteers</p><h2 id="volunteer-title">The wider<br /><em>crew.</em></h2></div>
        <p>Every event is a team sport. Browse the volunteers who make the work happen across departments.</p>
      </div>
      <div className="volunteer-filter" role="group" aria-label="Filter volunteers by department">
        {roles.map((role) => <button key={role} type="button" aria-pressed={selectedRole === role} onClick={() => setSelectedRole(role)} className={selectedRole === role ? 'is-selected' : ''}>{role}</button>)}
      </div>
      <div className="volunteer-list">
        {visibleVolunteers.map(({ id, name, role }, index) => <div className="volunteer-row" key={id}><span>{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong><em>{role || 'Volunteer'}</em></div>)}
      </div>
    </section>
  )
}

export default Volunteers
