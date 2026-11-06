'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getHackerNewsConfigClient } from '@/lib/api/client/hacker-news-config'
import type { HackerNewsConfig } from '@/lib/hacker-news-config'

import { HackerNewsConfigContext } from './hacker-news-config-context'

export function HackerNewsConfigProvider({
  initialConfig,
  children,
}: {
  initialConfig: HackerNewsConfig
  children: ReactNode
}) {
  const [snapshot, setSnapshot] = useState({ initialConfig, config: initialConfig })
  if (
    snapshot.initialConfig.references_visible !== initialConfig.references_visible ||
    snapshot.initialConfig.post_time_range_cap !== initialConfig.post_time_range_cap
  ) {
    setSnapshot({ initialConfig, config: initialConfig })
  }
  const config = snapshot.config
  const router = useRouter()
  useEffect(() => {
    let active = true
    let current = initialConfig
    async function refresh() {
      try {
        const next = await getHackerNewsConfigClient()
        if (!active) return
        if (
          next.references_visible !== current.references_visible ||
          next.post_time_range_cap !== current.post_time_range_cap
        ) {
          current = next
          setSnapshot({ initialConfig, config: next })
          router.refresh()
        }
      } catch {
        // Keep the last known setting until the next successful read.
      }
    }
    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, 30_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [router, initialConfig])
  return (
    <HackerNewsConfigContext.Provider value={config}>{children}</HackerNewsConfigContext.Provider>
  )
}
