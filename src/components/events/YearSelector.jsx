/* eslint-disable react/prop-types */

const YEAR_OPTIONS = ['2026', '2025', '2024', '2023', 'Previous Years']

function YearSelector({ selectedYear, onChange }) {
  return (
    <nav className="archive-years" aria-label="Filter events by year">
      <span>Browse by year</span>
      <div role="tablist" aria-label="Event years">
        {YEAR_OPTIONS.map((year) => (
          <button key={year} type="button" role="tab" aria-selected={selectedYear === year} onClick={() => onChange(year)} className={selectedYear === year ? 'is-selected' : ''}>
            {year}
          </button>
        ))}
      </div>
    </nav>
  )
}

export default YearSelector
