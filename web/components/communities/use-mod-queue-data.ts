'use client'

import { useMemo, useReducer, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import {
  getCommunityPendingModerationReportsClient,
  type ModerationReportSortParam,
} from '@/lib/api/client/reports'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import {
  communityModeratorVisibleReportSort,
  createInitialReportsPage,
  mergeVisibleReports,
} from './mod-queue-report-data'
import { initialModQueueState, modQueueReducer, type ModQueueTab } from './mod-queue-state'
import type {
  CommunityModerationReportsResponseBody,
  CommunityPostsResponseBody,
} from '@/types/api-responses'

export function useModQueueData({
  communitySlug,
  data,
  isStaff,
  reportSort,
  reportsData,
}: {
  communitySlug: string
  data: CommunityPostsResponseBody
  isStaff: boolean
  reportSort: ModerationReportSortParam
  reportsData?: CommunityModerationReportsResponseBody
}) {
  const router = useRouter()
  const { refresh } = router
  const endpoint = `/api/v1/communities/${encodeURIComponent(communitySlug)}/posts/pending`
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, endpoint, {})
  const results = mergePageResultsById(pages)
  const postsById = mergeRecords(pages, page => page.posts)
  const [state, dispatch] = useReducer(modQueueReducer, initialModQueueState)
  const [isPending, startTransition] = useTransition()
  const effectiveReportSort = isStaff ? reportSort : communityModeratorVisibleReportSort(reportSort)
  const reportEndpoint = `/api/v1/communities/${encodeURIComponent(communitySlug)}/reports/pending`
  const initialReportsPage = useMemo(() => createInitialReportsPage(reportsData), [reportsData])
  const reportPagination = usePaginatedList(
    initialReportsPage,
    reportEndpoint,
    { sort: effectiveReportSort },
    {
      loadPage: async after => {
        const page = await getCommunityPendingModerationReportsClient(communitySlug, {
          after,
          sort: effectiveReportSort,
        })
        return {
          reports: page.reports,
          page_info: page.page_info ?? {
            has_next_page: false,
            end_cursor: null,
            start_cursor: null,
          },
        }
      },
    },
  )
  const handleLoadMoreReports = reportPagination.loadMore
  const posts = results.flatMap(result => {
    const post = postsById[result.id]
    return post && !state.resolvedPostIds.has(post.id) ? [post] : []
  })
  const reports = useMemo(
    () => mergeVisibleReports(reportPagination.pages, initialReportsPage, state.resolvedReportIds),
    [initialReportsPage, reportPagination.pages, state.resolvedReportIds],
  )
  const pendingReports = useMemo(() => reports.filter(report => !report.escalated_at), [reports])
  const pendingPosts = useMemo(() => posts.filter(post => !post.escalated_at), [posts])
  const escalatedReports = useMemo(
    () => reports.filter(report => Boolean(report.escalated_at)),
    [reports],
  )
  const escalatedPosts = useMemo(() => posts.filter(post => Boolean(post.escalated_at)), [posts])
  const fallbackActiveTab: ModQueueTab =
    pendingReports.length > 0 ? 'reports' : pendingPosts.length > 0 ? 'posts' : 'escalated'
  const reportsById = useMemo(() => new Map(reports.map(report => [report.id, report])), [reports])

  function handleReportSortChange(value: ModerationReportSortParam) {
    const next = new URL(window.location.href).searchParams
    next.set('reportSort', isStaff ? value : communityModeratorVisibleReportSort(value))
    router.push(`?${next.toString()}`, { scroll: false })
  }

  return {
    clearError,
    dispatch,
    effectiveReportSort,
    endCursor,
    escalatedPosts,
    escalatedReports,
    fallbackActiveTab,
    fetchError,
    handleLoadMoreReports,
    handleReportSortChange,
    hasNextPage,
    isPending,
    isStaff,
    loadMore,
    loadingMore,
    pendingPosts,
    pendingReports,
    posts,
    refresh,
    reportPagination,
    reports,
    reportsById,
    resetKey,
    router,
    startTransition,
    state,
  }
}

export type ModQueueData = ReturnType<typeof useModQueueData>
