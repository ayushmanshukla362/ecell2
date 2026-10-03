/* eslint-disable react/prop-types */

function YearSelector({ years, selectedYear, onChange }) {
  return (
    <nav className="archive-years" aria-label="Filter events by year">
      <span>Browse by year</span>
      <div role="group" aria-label="Event years">
        {years.map((year) => (
          <button key={year} type="button" aria-pressed={selectedYear === year} onClick={() => onChange(year)} className={selectedYear === year ? 'is-selected' : ''}>
            {year}
          </button>
        ))}
      </div>
    </nav>
  )
}

export default YearSelector
