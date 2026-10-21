/* eslint-disable react/prop-types, react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import './content.css'

const ContentContext = createContext(null)

function readBootstrapContent() {
  if (typeof document === 'undefined') return null
  const node = document.getElementById('ecell-content-bootstrap')
  if (!node) return null
  try {
    const data = JSON.parse(node.textContent || '')
    if (!Array.isArray(data?.events) || !Array.isArray(data?.members)) return null
    node.remove()
    return { events: data.events, members: data.members }
  } catch { return null }
}

const bootstrapContent = readBootstrapContent()

export function ContentProvider({ children }) {
  const [content, setContent] = useState(() => bootstrapContent || { events: [], members: [] })
  const [loading, setLoading] = useState(!bootstrapContent)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const loaded = useRef(Boolean(bootstrapContent))
  const backgroundRefresh = useRef(Boolean(bootstrapContent))
  const inFlight = useRef(null)

  const load = useCallback(async ({ fresh = false } = {}) => {
    const current = ++request.current
    const hadContent = loaded.current
    if (hadContent) setRefreshing(true)
    else setLoading(true)
    try {
      const path = fresh ? `/api/content?refresh=${Date.now()}` : '/api/content'
      const data = await api(path, fresh ? { cache: 'no-store' } : {})
      if (!Array.isArray(data?.events) || !Array.isArray(data?.members)) throw new Error('The content response was incomplete. Please retry.')
      if (current === request.current) {
        loaded.current = true
        setContent({ events: data.events, members: data.members })
        setError('')
      }
      return data
    } catch (cause) {
      if (current === request.current) setError(cause.message || 'Content could not be loaded.')
      return null
    } finally {
      if (current === request.current) {
        if (hadContent) setRefreshing(false)
        else setLoading(false)
      }
    }
  }, [])

  const refresh = useCallback((options = {}) => load(options), [load])

  const ensure = useCallback(() => {
    if (backgroundRefresh.current) {
      backgroundRefresh.current = false
      if (!inFlight.current) inFlight.current = refresh().finally(() => { inFlight.current = null })
      return inFlight.current
    }
    if (loaded.current) return inFlight.current || Promise.resolve()
    if (!inFlight.current) inFlight.current = refresh().finally(() => { inFlight.current = null })
    return inFlight.current
  }, [refresh])
  const retry = useCallback(() => refresh({ fresh: true }), [refresh])

  useEffect(() => {
    return () => { request.current += 1 }
  }, [])

  return <ContentContext.Provider value={{ ...content, loading, refreshing, error, refresh, retry, ensure }}>{children}</ContentContext.Provider>
}

export function useContent() {
  const context = useContext(ContentContext)
  if (!context) throw new Error('useContent must be used inside ContentProvider')
  const { ensure } = context
  useEffect(() => {
    ensure()
  }, [ensure])
  return context
}

export function useContentActions() {
  const context = useContext(ContentContext)
  if (!context) throw new Error('useContentActions must be used inside ContentProvider')
  return { refresh: context.refresh, retry: context.retry }
}
