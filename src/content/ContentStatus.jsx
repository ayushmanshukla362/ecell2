/* eslint-disable react/prop-types */
export default function ContentStatus({ loading, error, retry, empty = false, emptyMessage = 'Nothing has been published here yet.' }) {
  if (error && empty) return <div className="content-status content-status--error" role="alert"><p>Content could not be loaded. {error}</p><button type="button" onClick={retry} disabled={loading}>{loading ? 'Retrying…' : 'Try again'}</button></div>
  if (loading && empty) return <p className="content-status" role="status">Loading content…</p>
  if (empty) return <p className="content-status">{emptyMessage}</p>
  return null
}
