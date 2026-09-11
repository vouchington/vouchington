'use client'

import { createContext, use } from 'react'
import type { Theme } from './shared'

export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const context = use(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
