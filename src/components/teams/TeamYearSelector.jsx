/* eslint-disable react/prop-types */

function TeamYearSelector({ years, currentTeam, onChange }) {
  return (
    <div className="team-years" role="group" aria-label="Select a team year">
      {years.map((year) => (
        <button key={year} type="button" aria-pressed={currentTeam === year} className={currentTeam === year ? 'is-selected' : ''} onClick={() => onChange(year)}>
          {year}
        </button>
      ))}
    </div>
  )
}

export default TeamYearSelector
