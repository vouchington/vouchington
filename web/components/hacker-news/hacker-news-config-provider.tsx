'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getHackerNewsConfigClient } from '@/lib/api/client/hacker-news-config'
import type { HackerNewsConfig } from '@/lib/hacker-news-config'

import {
  HackerNewsConfigContext,
  HackerNewsReferenceRefreshGenerationContext,
} from './hacker-news-config-context'

export function HackerNewsConfigProvider({
  initialConfig,
  children,
}: {
  initialConfig: HackerNewsConfig
  children: ReactNode
}) {
  const [snapshot, setSnapshot] = useState({
    initialConfig,
    serverConfig: initialConfig,
    config: initialConfig,
    referenceRefreshGeneration: 0,
    pendingHiddenVisibilityCycle: false,
  })
  const serverConfigChanged = snapshot.serverConfig !== initialConfig
  const serverValuesChanged =
    snapshot.initialConfig.references_visible !== initialConfig.references_visible ||
    snapshot.initialConfig.post_time_range_cap !== initialConfig.post_time_range_cap
  const serverVisibilityChanged =
    snapshot.initialConfig.references_visible !== initialConfig.references_visible
  const acknowledgeHiddenCycle =
    serverConfigChanged &&
    snapshot.pendingHiddenVisibilityCycle &&
    snapshot.config.references_visible &&
    initialConfig.references_visible
  if (serverValuesChanged) {
    const referenceRefreshGeneration =
      initialConfig.references_visible && (serverVisibilityChanged || acknowledgeHiddenCycle)
        ? snapshot.referenceRefreshGeneration + 1
        : snapshot.referenceRefreshGeneration
    setSnapshot({
      initialConfig,
      serverConfig: initialConfig,
      // A range-only server update cannot undo a newer polled visibility setting.
      config: serverVisibilityChanged
        ? initialConfig
        : { ...initialConfig, references_visible: snapshot.config.references_visible },
      referenceRefreshGeneration,
      pendingHiddenVisibilityCycle:
        referenceRefreshGeneration > snapshot.referenceRefreshGeneration
          ? false
          : snapshot.pendingHiddenVisibilityCycle,
    })
  } else if (serverConfigChanged) {
    const referenceRefreshGeneration = acknowledgeHiddenCycle
      ? snapshot.referenceRefreshGeneration + 1
      : snapshot.referenceRefreshGeneration
    setSnapshot(previous => ({
      ...previous,
      serverConfig: initialConfig,
      referenceRefreshGeneration,
      pendingHiddenVisibilityCycle: acknowledgeHiddenCycle
        ? false
        : previous.pendingHiddenVisibilityCycle,
    }))
  }
  const config = snapshot.config
  const observedConfig = useRef(config)
  useLayoutEffect(() => {
    observedConfig.current = config
  }, [config])
  const initialReferencesVisible = initialConfig.references_visible
  const initialPostTimeRangeCap = initialConfig.post_time_range_cap
  const router = useRouter()
  useEffect(() => {
    const lifetime = new AbortController()
    const serverConfig: HackerNewsConfig = {
      references_visible: initialReferencesVisible,
      post_time_range_cap: initialPostTimeRangeCap,
    }
    const seen = { config: observedConfig.current }
    async function refresh() {
      try {
        const next = await getHackerNewsConfigClient()
        if (lifetime.signal.aborted) return
        const changed =
          next.references_visible !== seen.config.references_visible ||
          next.post_time_range_cap !== seen.config.post_time_range_cap
        if (changed) {
          const observedHiddenCycle = seen.config.references_visible && !next.references_visible
          seen.config = next
          setSnapshot(previous => ({
            ...previous,
            config: next,
            pendingHiddenVisibilityCycle:
              previous.pendingHiddenVisibilityCycle || observedHiddenCycle,
          }))
        }
        if (
          changed ||
          next.references_visible !== serverConfig.references_visible ||
          next.post_time_range_cap !== serverConfig.post_time_range_cap
        ) {
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
      lifetime.abort()
      clearInterval(timer)
    }
  }, [router, initialReferencesVisible, initialPostTimeRangeCap])
  return (
    <HackerNewsReferenceRefreshGenerationContext.Provider
      value={snapshot.referenceRefreshGeneration}
    >
      <HackerNewsConfigContext.Provider value={config}>{children}</HackerNewsConfigContext.Provider>
    </HackerNewsReferenceRefreshGenerationContext.Provider>
  )
}
