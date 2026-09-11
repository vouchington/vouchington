'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { NavIntentContext, type NavIntentOverride } from './nav-intent-context'
import type { NavIntentId } from './types'

export function NavIntentProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = useState<NavIntentOverride | null>(null)
  const set = useCallback((pathname: string, intent: NavIntentId) => {
    setOverride(prev =>
      prev && prev.pathname === pathname && prev.intent === intent ? prev : { pathname, intent },
    )
  }, [])
  const value = useMemo(() => ({ override, set }), [override, set])
  return <NavIntentContext value={value}>{children}</NavIntentContext>
}

/**
 * Server-rendered pages pass intent as a prop; this component registers it
 * with the nearest NavIntentProvider so the sidebar/header reflect feed_type.
 * Renders null (no SSR markup) to avoid hydration mismatches.
 * Pass `pathname` to register on a canonical base path so all sub-tabs match.
 */
export function SetNavIntent({ intent, pathname }: { intent: NavIntentId; pathname?: string }) {
  const currentPathname = usePathname()
  const set = use(NavIntentContext)?.set
  const targetPathname = pathname ?? currentPathname
  useEffect(() => set?.(targetPathname, intent), [targetPathname, intent, set])
  return null
}
