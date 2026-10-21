/* eslint-disable react/prop-types */
export default function ContentStatus({ loading, refreshing = false, error, retry, empty = false, emptyMessage = 'Nothing has been published here yet.' }) {
  if (error) {
    const retrying = loading || refreshing
    const message = empty || loading ? 'Content could not be loaded.' : 'The latest content could not be loaded. Showing the last available content.'
    return <div className="content-status content-status--error" role="alert"><p>{message} {error}</p><button type="button" onClick={retry} disabled={retrying}>{retrying ? 'Retrying…' : 'Try again'}</button></div>
  }
  if (loading) return <p className="content-status" role="status">Loading content…</p>
  if (refreshing && empty) return <p className="content-status content-status--refreshing" role="status">Updating content…</p>
  if (empty) return <p className="content-status">{emptyMessage}</p>
  return null
}
