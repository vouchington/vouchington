'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { THEME_COOKIE, DEFAULT_THEME, isValidTheme, type Theme } from './shared'
import { getPreference, setPreference } from './storage'
import { ThemeContext } from './use-theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeValue, setThemeValue] = useState<Theme>(() => {
    if (typeof document === 'undefined') return DEFAULT_THEME
    const stored = getPreference(THEME_COOKIE)
    return stored && isValidTheme(stored) ? stored : DEFAULT_THEME
  })

  // useCallback with [] is required: setTheme must be stable so it can appear in
  // the useMemo dep array below without causing the context value to update every render.
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeValue(newTheme)
    setPreference(THEME_COOKIE, newTheme)
    applyTheme(newTheme)
  }, [])

  // Apply theme on mount and when theme changes, and listen for OS preference changes
  // when in system mode. The blocking inline script sets the class before hydration,
  // but React hydration wipes the <html> class attribute — this effect restores it.
  useEffect(() => {
    applyTheme(themeValue)

    if (themeValue !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    function handleChange(e: MediaQueryListEvent) {
      document.documentElement.classList.toggle('dark', e.matches)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [themeValue])

  const value = useMemo(() => ({ theme: themeValue, setTheme }), [themeValue, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'dark') {
    html.classList.add('dark')
  } else if (theme === 'light') {
    html.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    html.classList.toggle('dark', prefersDark)
  }
}
