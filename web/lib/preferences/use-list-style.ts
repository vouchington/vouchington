'use client'

import { createContext, use } from 'react'
import type { ListStyle } from './shared'

export interface ListStyleContextValue {
  listStyle: ListStyle
  setListStyle: (listStyle: ListStyle) => void
}

export const ListStyleContext = createContext<ListStyleContextValue | null>(null)

export function useListStyle() {
  const context = use(ListStyleContext)
  if (!context) throw new Error('useListStyle must be used within ListStyleProvider')
  return context
}
