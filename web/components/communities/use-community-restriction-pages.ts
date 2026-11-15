'use client'

import { useEffect, useRef, useState } from 'react'
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
    slug: string
    initialData: CommunityRestrictionsResponseBody
    status: 'active' | 'past'
    data: CommunityRestrictionsResponseBody
  } | null>(null)
  const [loadingPage, setLoadingPage] = useState<{
    slug: string
    initialData: CommunityRestrictionsResponseBody
  } | null>(null)
  const generationRef = useRef(0)
  const loadingRef = useRef(false)
  useEffect(() => {
    generationRef.current += 1
    loadingRef.current = false
    return () => {
      generationRef.current += 1
    }
  }, [slug, initialData])
  const currentPage = page?.slug === slug && page.initialData === initialData ? page : null
  const isLoading = loadingPage?.slug === slug && loadingPage.initialData === initialData
  const visibleData = currentPage?.data ?? initialData
  const restrictions = visibleData.results.flatMap(ref => {
    const restriction = visibleData.community_restrictions[ref.id]
    return restriction ? [restriction] : []
  })
  async function load(status: 'active' | 'past', after?: string) {
    if (loadingRef.current) return
    const generation = generationRef.current
    loadingRef.current = true
    setLoadingPage({ slug, initialData })
    try {
      const data = await getCommunityRestrictionPage(slug, { status, after })
      if (generation !== generationRef.current) return
      setPage(previous => {
        if (generation !== generationRef.current) return previous
        const previousData =
          previous?.slug === slug && previous.initialData === initialData
            ? previous.data
            : initialData
        return {
          slug,
          initialData,
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
      if (generation !== generationRef.current) return
      onError(err, {
        fallback: t(
          'extracted.communities.communityAgentPromptHistory.failedToLoadHistory_eeddd17d',
        ),
        tags: { form: 'community-restrictions' },
      })
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false
        setLoadingPage(null)
      }
    }
  }
  return {
    status: currentPage?.status ?? 'active',
    visibleData,
    restrictions,
    isLoading,
    load,
    resetRestrictions: () => {
      generationRef.current += 1
      loadingRef.current = false
      setLoadingPage(null)
      setPage(null)
    },
  }
}
