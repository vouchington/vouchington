'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { TimeAgo } from '@/components/shared/time-ago'
import {
  getModmailInboxClient,
  type ModmailInboxResponseBody,
  type ModmailThread,
} from '@/lib/api/client/modmail'
import { createCommunityPathname } from '@/lib/links/entity-href'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  communitySlug: string
  initialData: ModmailInboxResponseBody | null
}

export function ModmailInbox({ communitySlug, initialData }: Props) {
  const t = useTranslations()
  const [threads, setThreads] = useState<ModmailThread[]>(initialData?.results ?? [])
  const [pageInfo, setPageInfo] = useState({
    hasMore: initialData?.page_info.has_next_page ?? false,
    endCursor: initialData?.page_info.end_cursor ?? null,
  })
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<Error | null>(
    initialData ? null : new Error('Server-rendered modmail inbox unavailable'),
  )
  const [hasLoadedFirstPage, setHasLoadedFirstPage] = useState(initialData !== null)
  const generationRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const hasLoadedFirstPageRef = useRef(initialData !== null)

  useEffect(() => {
    generationRef.current += 1
    return () => {
      generationRef.current += 1
    }
  }, [communitySlug])

  async function handleLoadMore() {
    const cursor = pageInfo.endCursor
    if ((hasLoadedFirstPageRef.current && !cursor) || loadingMoreRef.current) return
    const generation = generationRef.current
    const contextSlug = communitySlug
    const isFirstPageRetry = !hasLoadedFirstPageRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    if (!isFirstPageRetry) setLoadError(null)
    try {
      const res = cursor
        ? await getModmailInboxClient(contextSlug, { after: cursor })
        : await getModmailInboxClient(contextSlug)
      if (generation !== generationRef.current || contextSlug !== communitySlug) return
      setThreads(prev => appendUniqueThreads(isFirstPageRetry ? [] : prev, res.results))
      hasLoadedFirstPageRef.current = true
      setHasLoadedFirstPage(true)
      setLoadError(null)
      setPageInfo({
        hasMore: res.page_info.has_next_page,
        endCursor: res.page_info.end_cursor,
      })
    } catch (error) {
      if (generation === generationRef.current && contextSlug === communitySlug) {
        setLoadError(error instanceof Error ? error : new Error(String(error)))
        onError(error, {
          fallback: isFirstPageRetry
            ? t('extracted.communities.modmailInbox.failedToLoadModmailInbox_b0fe8c15')
            : t('extracted.communities.modmailInbox.failedToLoadMoreThreads_c5092cf8'),
          tags: { action: 'modmail-inbox-more', communitySlug: contextSlug },
        })
      }
    } finally {
      if (generation === generationRef.current && contextSlug === communitySlug) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }

  return (
    <section
      className='space-y-3'
      data-pw='modmail-inbox'
    >
      <h3 className='text-sm font-semibold uppercase text-muted-foreground'>
        {t('extracted.communities.modmailInbox.modmailInbox_f8406a58')}
      </h3>
      <InfiniteScroll
        hasNextPage={pageInfo.hasMore}
        endCursor={pageInfo.endCursor}
        onLoadMore={handleLoadMore}
        loadingMore={loadingMore}
        fetchError={hasLoadedFirstPage ? loadError : null}
        clearError={() => setLoadError(null)}
        resetKey={communitySlug}
      >
        {hasLoadedFirstPage && threads.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.communities.modmailInbox.noModmailThreadsYet_2115a287')}
          </p>
        ) : threads.length > 0 ? (
          <div className='divide-y rounded-lg border bg-card'>
            {threads.map(thread => (
              <Link
                key={thread.id}
                href={createCommunityPathname(
                  communitySlug,
                  `/settings/moderation/modmail/${thread.id}`,
                )}
                prefetch={false}
                className='flex items-center justify-between p-4 hover:bg-muted/50'
                data-pw='modmail-inbox-item'
              >
                <div className='space-y-1'>
                  <p className='text-sm font-medium'>
                    {thread.subject_user_id
                      ? t('extracted.communities.modmailInbox.userSubjectuserid_8254fa04', {
                          subjectUserId: thread.subject_user_id,
                        })
                      : t('extracted.communities.modmailInbox.anonymousRequest_66f732e1')}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {t('extracted.communities.modmailInbox.opened_b19fb8d1')}{' '}
                    <TimeAgo date={thread.created_at} />
                    {thread.assigned_mod_id
                      ? ` ${t(
                          'extracted.communities.modmailInbox.assignedToAssignedmodid_8de12935',
                          {
                            assignedModId: thread.assigned_mod_id,
                          },
                        )}`
                      : ''}
                  </p>
                </div>
                <Badge variant={thread.resolved_at ? 'secondary' : 'default'}>
                  {thread.resolved_at
                    ? t('extracted.communities.modmailInbox.resolved_dc676b42')
                    : t('extracted.communities.modmailInbox.open_2348f998')}
                </Badge>
              </Link>
            ))}
          </div>
        ) : null}
      </InfiniteScroll>
      {!hasLoadedFirstPage && loadError ? (
        <div className='flex flex-col items-center gap-2 py-4'>
          <p className='text-sm text-destructive'>
            {t('extracted.communities.modmailInbox.failedToLoadModmailInbox_b0fe8c15')}
          </p>
          <Button
            variant='outline'
            size='sm'
            disabled={loadingMore}
            loading={loadingMore}
            onClick={() => {
              handleLoadMore().catch(() => {})
            }}
          >
            {t('extracted.shared.paginatedListFooter.retry_942087cc')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function appendUniqueThreads(
  existing: ModmailThread[],
  incoming: ModmailThread[],
): ModmailThread[] {
  const seen = new Set(existing.map(thread => thread.id))
  const uniqueIncoming = incoming.filter(thread => {
    if (seen.has(thread.id)) return false
    seen.add(thread.id)
    return true
  })
  return [...existing, ...uniqueIncoming]
}
