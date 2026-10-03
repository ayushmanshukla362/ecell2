/* eslint-disable react/prop-types, react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import './content.css'

const ContentContext = createContext(null)

export function ContentProvider({ children }) {
  const [content, setContent] = useState({ events: [], members: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useRef(0)

  const refresh = useCallback(async () => {
    const current = ++request.current
    setLoading(true)
    setError('')
    try {
      const data = await api('/api/content')
      if (!Array.isArray(data?.events) || !Array.isArray(data?.members)) throw new Error('The content response was incomplete. Please retry.')
      if (current === request.current) setContent({ events: data.events, members: data.members })
      return data
    } catch (cause) {
      if (current === request.current) setError(cause.message || 'Content could not be loaded.')
      return null
    } finally {
      if (current === request.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    return () => { request.current += 1 }
  }, [refresh])

  return <ContentContext.Provider value={{ ...content, loading, error, refresh, retry: refresh }}>{children}</ContentContext.Provider>
}

export function useContent() {
  const context = useContext(ContentContext)
  if (!context) throw new Error('useContent must be used inside ContentProvider')
  return context
}
