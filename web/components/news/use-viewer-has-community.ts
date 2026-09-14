import { loadMyCommunities } from '@/lib/api/client/communities'
import { useEffect, useState } from 'react'

let cachedPromise: Promise<boolean> | null = null

export function resetViewerHasCommunityCache(): void {
  cachedPromise = null
}

export function useViewerHasCommunity(enabled: boolean): boolean {
  const [hasCommunity, setHasCommunity] = useState(false)
  useEffect(() => {
    if (!enabled) {
      // Clear cache so the next enabled=true run fetches fresh data for the new session.
      resetViewerHasCommunityCache()
      return
    }
    if (!cachedPromise) {
      cachedPromise = loadMyCommunities()
        .then(list => list.length > 0)
        .catch(() => {
          cachedPromise = null // allow retry on next mount after transient failure
          return false
        })
    }
    let active = true
    void cachedPromise.then(v => {
      if (active) setHasCommunity(v)
    })
    return () => {
      active = false
      // Reset on logout or unmount so a subsequent login starts from false until
      // the new fetch settles — prevents stale membership leaking across accounts.
      setHasCommunity(false)
    }
  }, [enabled])
  // Gate the return value on enabled so signed-out viewers always get false even if
  // hasCommunity state is stale from a prior session in the same SPA lifecycle.
  return enabled && hasCommunity
}
