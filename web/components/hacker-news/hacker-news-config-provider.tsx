'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  const [config, setConfig] = useState(initialConfig)
  const current = useRef(initialConfig)
  const router = useRouter()
  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const next = await getHackerNewsConfigClient()
        if (!active) return
        if (
          next.references_visible !== current.current.references_visible ||
          next.post_time_range_cap !== current.current.post_time_range_cap
        ) {
          current.current = next
          setConfig(next)
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
  }, [router])
  return (
    <HackerNewsConfigContext.Provider value={config}>{children}</HackerNewsConfigContext.Provider>
  )
}
