'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getCommunityRestrictionPage } from '@/lib/api/client/community-restrictions'
import onError from '@/lib/on-error'
import type { CommunityRestrictionsResponseBody } from '@/types/api-responses'

export function useCommunityRestrictionPages(
  slug: string,
  initialData: CommunityRestrictionsResponseBody,
) {
  const t = useTranslations()
  const [page, setPage] = useState<{
    status: 'active' | 'past'
    data: CommunityRestrictionsResponseBody | null
  }>({ status: 'active', data: null })
  const [isLoading, setIsLoading] = useState(false)
  const visibleData = page.data ?? initialData
  const restrictions = visibleData.results.flatMap(ref => {
    const restriction = visibleData.community_restrictions[ref.id]
    return restriction ? [restriction] : []
  })
  async function load(status: 'active' | 'past', after?: string) {
    if (isLoading) return
    setIsLoading(true)
    try {
      const data = await getCommunityRestrictionPage(slug, { status, after })
      setPage(previous => {
        const previousData = previous.data ?? initialData
        return {
          status,
          data: after
            ? {
                ...data,
                results: [...previousData.results, ...data.results],
                community_restrictions: {
                  ...previousData.community_restrictions,
                  ...data.community_restrictions,
                },
              }
            : data,
        }
      })
    } catch (err) {
      onError(err, {
        fallback: t(
          'extracted.communities.communityAgentPromptHistory.failedToLoadHistory_eeddd17d',
        ),
        tags: { form: 'community-restrictions' },
      })
    } finally {
      setIsLoading(false)
    }
  }
  return {
    status: page.status,
    visibleData,
    restrictions,
    isLoading,
    load,
    resetRestrictions: () => setPage({ status: 'active', data: null }),
  }
}
