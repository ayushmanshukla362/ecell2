/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react'
import { Search, Users, X } from 'lucide-react'
import { api } from '../lib/api'

export default function UserPicker({ id, selected, onChange, disabled = false, unavailable, reloadKey = 0 }) {
  const [search, setSearch] = useState('')
  const [batch, setBatch] = useState('')
  const [year, setYear] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ users: [], batches: [], years: [], total: 0, pageSize: 30 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loadedKey, setLoadedKey] = useState('')
  const request = useRef(0)
  const selectPage = useRef(null)
  const query = search.trim()
  const shortQuery = query.length === 1
  const key = JSON.stringify([query, batch, year, page, reloadKey, retry])

  useEffect(() => {
    const current = ++request.current
    setError('')
    if (shortQuery) { setLoading(false); return undefined }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, batch, year, page: String(page) })
        const result = await api(`/api/admin/users?${params}`)
        if (!Array.isArray(result?.users) || !Array.isArray(result.batches) || !Array.isArray(result.years)) throw new Error('The user directory response was incomplete.')
        if (request.current === current) { setData(result); setLoadedKey(key) }
      } catch (problem) { if (request.current === current) setError(problem.message || 'Users could not be loaded.') }
      finally { if (request.current === current) setLoading(false) }
    }, query ? 250 : 0)
    return () => { clearTimeout(timer); request.current += 1 }
  }, [query, batch, year, page, reloadKey, retry, key, shortQuery])

  const ready = !shortQuery && !loading && !error && loadedKey === key
  const rows = ready ? data.users : []
  const selectedIds = new Set(selected.map((user) => user.id))
  const eligible = rows.filter((user) => !unavailable?.(user))
  const selectedOnPage = eligible.filter((user) => selectedIds.has(user.id)).length
  const allOnPage = eligible.length > 0 && selectedOnPage === eligible.length
  useEffect(() => { if (selectPage.current) selectPage.current.indeterminate = selectedOnPage > 0 && !allOnPage }, [selectedOnPage, allOnPage])
  const toggle = (user) => {
    if (disabled) return
    onChange(selectedIds.has(user.id) ? selected.filter((item) => item.id !== user.id) : selected.length < 100 ? [...selected, user] : selected)
  }
  const togglePage = () => {
    if (disabled || !ready) return
    onChange(allOnPage ? selected.filter((user) => !eligible.some((row) => row.id === user.id)) : [...selected, ...eligible.filter((user) => !selectedIds.has(user.id)).slice(0, 100 - selected.length)])
  }

  return <section className="admin-user-picker" aria-label="Registered user selection" aria-busy={loading}>
    <div className="admin-picker-heading"><Users size={20} aria-hidden="true" /><div><h3>Find registered users</h3><p>Search by part of an email or name (at least 2 characters). Team batches reflect saved roster assignments; signup year is the account registration year.</p></div></div>
    <div className="admin-filters admin-picker-filters">
      <label htmlFor={`${id}-search`}>Search users<div className="admin-picker-search"><Search size={17} aria-hidden="true" /><input id={`${id}-search`} type="search" autoComplete="off" maxLength={254} placeholder="Email or name, e.g. sh or @abes" value={search} disabled={disabled} aria-describedby={`${id}-status`} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></div></label>
      <label htmlFor={`${id}-batch`}>Team batch<select id={`${id}-batch`} value={batch} disabled={disabled} onChange={(event) => { setBatch(event.target.value); setPage(1) }}><option value="">All batches</option><option value="unassigned">Unassigned users</option>{data.batches.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label htmlFor={`${id}-year`}>Signup year<select id={`${id}-year`} value={year} disabled={disabled} onChange={(event) => { setYear(event.target.value); setPage(1) }}><option value="">All years</option>{data.years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <div className="admin-picker-summary"><p aria-live="polite"><strong>{selected.length} selected</strong><span>Up to 100 users per operation</span></p><button className="admin-button" type="button" disabled={disabled || !selected.length} onClick={() => onChange([])}>Clear selection</button></div>
    {selected.length > 0 && <ul className="admin-picker-selected" aria-label="Selected users">{selected.map((user) => <li key={user.id}><span title={user.email}>{user.name} <small>{user.email}</small></span><button type="button" disabled={disabled} onClick={() => toggle(user)} aria-label={`Remove ${user.email} from selection`}><X size={16} aria-hidden="true" /></button></li>)}</ul>}
    <p id={`${id}-status`} className="admin-count" role="status">{shortQuery ? 'Type at least 2 characters to search users.' : loading || (!error && !ready) ? 'Searching users…' : error ? 'User search is unavailable.' : `${data.total} matching ${data.total === 1 ? 'user' : 'users'} · Selections are kept when you change filters or pages.`}</p>
    {error && <div className="admin-alert admin-alert--error" role="alert"><p>{error}</p><button className="admin-button" type="button" disabled={disabled} onClick={() => setRetry((value) => value + 1)}>Retry user search</button></div>}
    {ready && rows.length > 0 && <>
      <label className="admin-picker-select-all"><input ref={selectPage} type="checkbox" checked={allOnPage} disabled={disabled || !eligible.length || (!allOnPage && selected.length >= 100)} onChange={togglePage} /> Select this page <span>{eligible.length} eligible</span></label>
      <ul className="admin-picker-results" aria-label="User search results">{rows.map((user) => {
        const reason = unavailable?.(user)
        const checked = selectedIds.has(user.id)
        return <li key={user.id} className={checked ? 'is-selected' : ''}><label><input type="checkbox" checked={checked} disabled={disabled || Boolean(reason) || (!checked && selected.length >= 100)} onChange={() => toggle(user)} aria-label={`Select ${user.email}`} /><span className="admin-picker-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><span className="admin-picker-person"><strong>{user.name}</strong><span>{user.email}</span><small>{user.batches.length ? user.batches.join(' · ') : 'No team batch'} · Joined {user.joinedYear}</small></span>{reason && <span className="admin-picker-reason">{reason}</span>}</label></li>
      })}</ul>
    </>}
    {ready && !rows.length && <div className="admin-picker-empty"><Users size={26} aria-hidden="true" /><h4>No matching users</h4><p>Try another email fragment, name, or filter.</p></div>}
    {ready && data.total > data.pageSize && <nav className="admin-picker-pagination" aria-label="User results pages"><button type="button" className="admin-button" disabled={disabled || page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><button type="button" className="admin-button" disabled={disabled || page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}
  </section>
}
