'use client'

import { useState, useCallback, useMemo, useSyncExternalStore } from 'react'
import { FEED_STYLE_COOKIE, DEFAULT_FEED_STYLE, isValidFeedStyle, type FeedStyle } from './shared'
import { getPreference, setPreference } from './storage'
import { FeedStyleContext } from './use-feed-style'

function subscribeToFeedStyle() {
  return () => {}
}

function getStoredFeedStyleSnapshot(): FeedStyle {
  const stored = getPreference(FEED_STYLE_COOKIE)
  return stored && isValidFeedStyle(stored) ? stored : DEFAULT_FEED_STYLE
}

export function FeedStyleProvider({ children }: { children: React.ReactNode }) {
  const storedFeedStyle = useSyncExternalStore(
    subscribeToFeedStyle,
    getStoredFeedStyleSnapshot,
    () => DEFAULT_FEED_STYLE,
  )
  const [selectedFeedStyle, setSelectedFeedStyle] = useState<FeedStyle | null>(null)
  const feedStyleValue = selectedFeedStyle ?? storedFeedStyle

  // useCallback with [] keeps setFeedStyle stable so it can appear in the useMemo dep array.
  const setFeedStyle = useCallback((newFeedStyle: FeedStyle) => {
    setSelectedFeedStyle(newFeedStyle)
    setPreference(FEED_STYLE_COOKIE, newFeedStyle)
  }, [])

  const value = useMemo(
    () => ({ feedStyle: feedStyleValue, setFeedStyle }),
    [feedStyleValue, setFeedStyle],
  )

  return <FeedStyleContext.Provider value={value}>{children}</FeedStyleContext.Provider>
}
