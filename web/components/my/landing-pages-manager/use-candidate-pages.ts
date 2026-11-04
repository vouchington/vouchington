'use client'

import { useState } from 'react'
import { getMyLandingPageCandidatesClient } from '@/lib/api/client'
import type { LandingPageCandidatesResponseBody } from '@/types/api-responses'
import type { LandingPageCandidates } from '@/types/landing-pages'

function mergeCandidates(
  current: LandingPageCandidates,
  next: LandingPageCandidates,
): LandingPageCandidates {
  const merge = <T extends { id: string }>(a: T[], b: T[]) => [
    ...new Map([...a, ...b].map(item => [item.id, item])).values(),
  ]
  return {
    ...current,
    profile_links: merge(current.profile_links, next.profile_links),
    reviews: merge(current.reviews, next.reviews),
    referral_links: merge(current.referral_links, next.referral_links),
  }
}

export function useCandidatePages(initial: LandingPageCandidatesResponseBody) {
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function loadMore() {
    const cursor = data.page_info.end_cursor
    if (loading || !data.page_info.has_next_page || !cursor) return
    setLoading(true)
    setError(false)
    try {
      const next = await getMyLandingPageCandidatesClient(cursor)
      setData(previous => ({
        ...next,
        candidates: mergeCandidates(previous.candidates, next.candidates),
      }))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }
  function setItemLimit(itemLimit: number) {
    setData(previous => ({ ...previous, item_limit: itemLimit }))
  }
  return { data, loading, error, loadMore, setItemLimit }
}
