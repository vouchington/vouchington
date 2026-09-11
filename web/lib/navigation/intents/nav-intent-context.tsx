'use client'

import { createContext, use } from 'react'
import { getActiveIntent } from './resolver'
import type { NavIntentId } from './types'

export interface NavIntentOverride {
  pathname: string
  intent: NavIntentId
}

export interface NavIntentContextValue {
  override: NavIntentOverride | null
  set: (pathname: string, intent: NavIntentId) => void
}

export const NavIntentContext = createContext<NavIntentContextValue | null>(null)

/**
 * Returns the resolved nav intent for the given pathname.
 * When a SetNavIntent child has registered an override for this pathname (or its parent path), uses that.
 * Falls back to getActiveIntent() (pathname-only resolver).
 * Preserves null for /messages (chrome routes).
 */
export function useResolvedIntent(pathname: string): NavIntentId | null {
  const ctx = use(NavIntentContext)
  if (ctx?.override) {
    const { pathname: overridePath, intent } = ctx.override
    if (pathname === overridePath || pathname.startsWith(`${overridePath}/`)) {
      return intent
    }
  }
  return getActiveIntent(pathname)
}

/**
 * Server-rendered pages pass intent as a prop; this component registers it
 * with the nearest NavIntentProvider so the sidebar/header reflect feed_type.
 * Renders null (no SSR markup) to avoid hydration mismatches.
 * Pass `pathname` to register on a canonical base path so all sub-tabs match.
 */
