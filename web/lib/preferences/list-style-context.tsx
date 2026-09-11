'use client'

import { useState, useCallback, useMemo, useSyncExternalStore } from 'react'
import { LIST_STYLE_COOKIE, DEFAULT_LIST_STYLE, isValidListStyle, type ListStyle } from './shared'
import { getPreference, setPreference } from './storage'
import { ListStyleContext } from './use-list-style'

function subscribeToListStyle() {
  return () => {}
}

function getStoredListStyleSnapshot(): ListStyle {
  const stored = getPreference(LIST_STYLE_COOKIE)
  return stored && isValidListStyle(stored) ? stored : DEFAULT_LIST_STYLE
}

export function ListStyleProvider({ children }: { children: React.ReactNode }) {
  const storedListStyle = useSyncExternalStore(
    subscribeToListStyle,
    getStoredListStyleSnapshot,
    () => DEFAULT_LIST_STYLE,
  )
  const [selectedListStyle, setSelectedListStyle] = useState<ListStyle | null>(null)
  const listStyleValue = selectedListStyle ?? storedListStyle

  // useCallback with [] keeps setListStyle stable so it can appear in the useMemo dep array.
  const setListStyle = useCallback((newListStyle: ListStyle) => {
    setSelectedListStyle(newListStyle)
    setPreference(LIST_STYLE_COOKIE, newListStyle)
  }, [])

  const value = useMemo(
    () => ({ listStyle: listStyleValue, setListStyle }),
    [listStyleValue, setListStyle],
  )

  return <ListStyleContext.Provider value={value}>{children}</ListStyleContext.Provider>
}
