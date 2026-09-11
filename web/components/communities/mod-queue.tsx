'use client'
/* oxlint-disable max-lines -- mod queue owns queue rendering plus existing reducer and bulk state */

import { useMemo, useReducer, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import {
  BulkActionToolbar,
  type ModerationBulkAction,
} from '@/components/moderation/bulk-action-toolbar'
import {
  formatModerationBulkMessage,
  runModerationBulkOperations,
  type ModerationBulkOperation,
} from '@/components/moderation/bulk-operations'
import { useModerationQueueHotkeys } from '@/components/moderation/use-moderation-queue-hotkeys'
import { ExposureCooldownGate } from '@/components/moderation/exposure-cooldown-gate'
import { useExposureCooldown } from '@/components/moderation/use-exposure-cooldown'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { approvePost, rejectPost, unpublishCommunityPost } from '@/lib/api/client'
import { deletePost } from '@/lib/api/client/posts'
import {
  resolveCommunityModerationReport,
  getCommunityPendingModerationReportsClient,
  type ModerationReportSortParam,
} from '@/lib/api/client/reports'
import { MODERATION_QUEUE_SHORTCUTS } from '@/lib/keyboard-shortcuts'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ModQueuePosts } from './mod-queue-posts'
import { ModQueueReports } from './mod-queue-reports'
import {
  communityModeratorVisibleReportSort,
  createInitialReportsPage,
  mergeVisibleReports,
} from './mod-queue-report-data'
import { initialModQueueState, modQueueReducer } from './mod-queue-state'
import type {
  CommunityModerationReport,
  CommunityModerationReportsResponseBody,
  CommunityPostsResponseBody,
} from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

type ActiveTab = 'reports' | 'posts' | 'escalated'

interface ModQueueProps {
  data: CommunityPostsResponseBody
  reportsData?: CommunityModerationReportsResponseBody
  communitySlug: string
  currentUserId?: string | null
  isStaff?: boolean
  reportSort?: ModerationReportSortParam
  activeTab?: ActiveTab
  activeTabIsExplicit?: boolean
}

type SelectionKey = `post:${string}` | `report:${string}`

export function ModQueue({
  data,
  reportsData,
  communitySlug,
  currentUserId = null,
  isStaff = false,
  reportSort = 'severity',
  activeTab: initialActiveTab = 'reports',
  activeTabIsExplicit = false,
}: ModQueueProps) {
  const t = useTranslations()
  const router = useRouter()
  const { refresh } = router
  const endpoint = `/api/v1/communities/${encodeURIComponent(communitySlug)}/posts/pending`
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, endpoint, {})
  const results = mergePageResultsById(pages)
  const postsById = mergeRecords(pages, page => page.posts)
  const [state, dispatch] = useReducer(modQueueReducer, initialModQueueState)
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<SelectionKey>>(() => new Set())
  const [bulkAction, setBulkAction] = useState<ModerationBulkAction | null>(null)
  const [bulkReason, setBulkReason] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const cooldown = useExposureCooldown()
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
  const pendingReports = useMemo(() => reports.filter(r => !r.escalated_at), [reports])
  const pendingPosts = useMemo(() => posts.filter(p => !p.escalated_at), [posts])
  const escalatedReports = useMemo(() => reports.filter(r => Boolean(r.escalated_at)), [reports])
  const escalatedPosts = useMemo(() => posts.filter(p => Boolean(p.escalated_at)), [posts])
  const fallbackActiveTab =
    pendingReports.length > 0
      ? ('reports' as const)
      : pendingPosts.length > 0
        ? ('posts' as const)
        : ('escalated' as const)
  const reportsById = useMemo(() => new Map(reports.map(report => [report.id, report])), [reports])
  const selectedReportIds = useMemo(
    () =>
      new Set([...selectedKeys].flatMap(key => (key.startsWith('report:') ? [key.slice(7)] : []))),
    [selectedKeys],
  )
  const selectedPostIds = useMemo(
    () =>
      new Set([...selectedKeys].flatMap(key => (key.startsWith('post:') ? [key.slice(5)] : []))),
    [selectedKeys],
  )
  const mutationsDisabled = bulkLoading || state.loading !== null || isPending
  const hotkeyItems = [
    ...reports.flatMap(report =>
      report.community_ban_evasion
        ? []
        : [
            {
              key: `report:${report.id}`,
              tab: report.escalated_at ? ('escalated' as const) : ('reports' as const),
              onDismiss: () => handleResolveReport(report, 'dismissed'),
              onReview: () => handleResolveReport(report, 'reviewed'),
            },
          ],
    ),
    ...posts.map(post => ({
      key: `post:${post.id}`,
      tab: post.escalated_at ? ('escalated' as const) : ('posts' as const),
      onApprove: () => handleApprove(post.id),
      onRemove: () => handleRejectImmediate(post.id),
    })),
  ]
  const {
    activeKey,
    activeTab,
    helpOpen: shortcutsOpen,
    selectTab,
    setActiveKey,
    setHelpOpen: setShortcutsOpen,
  } = useModerationQueueHotkeys({
    disabled: mutationsDisabled,
    fallbackTab: fallbackActiveTab,
    initialTab: initialActiveTab,
    initialTabIsExplicit: activeTabIsExplicit,
    items: hotkeyItems,
    onSelectionToggle: key => toggleSelected(key as SelectionKey),
  })

  if (posts.length === 0 && reports.length === 0 && !hasNextPage && !reportPagination.hasNextPage) {
    return (
      <div
        className='rounded-md border bg-card p-4 text-center'
        data-pw='mod-queue-empty'
      >
        <p className='text-muted-foreground'>
          {t('extracted.communities.modQueue.noPostsOrReportsPendingReview_2f0c01ac')}
        </p>
      </div>
    )
  }

  async function handleApprove(postId: string) {
    dispatch({ type: 'start', id: postId })
    try {
      await approvePost(communitySlug, postId)
      dispatch({ type: 'post-resolved', postId })
      clearSelected(`post:${postId}`)
      startTransition(() => {
        refresh()
      })
    } catch (error) {
      dispatch({
        type: 'fail',
        message:
          error instanceof Error
            ? error.message
            : t('extracted.communities.modQueue.failedToApprovePost_fe0bb0b7'),
      })
    } finally {
      dispatch({ type: 'stop' })
    }
  }

  async function handleRejectSubmit(postId: string) {
    dispatch({ type: 'start', id: postId })
    try {
      await rejectPost(communitySlug, postId, state.rejectionReason)
      dispatch({ type: 'post-resolved', postId })
      dispatch({ type: 'reject-cancelled' })
      clearSelected(`post:${postId}`)
      startTransition(() => {
        refresh()
      })
    } catch (error) {
      dispatch({
        type: 'fail',
        message:
          error instanceof Error
            ? error.message
            : t('extracted.communities.modQueue.failedToRejectPost_05661041'),
      })
    } finally {
      dispatch({ type: 'stop' })
    }
  }

  async function handleRejectImmediate(postId: string) {
    dispatch({ type: 'start', id: postId })
    try {
      await rejectPost(communitySlug, postId, '')
      dispatch({ type: 'post-resolved', postId })
      dispatch({ type: 'reject-cancelled' })
      clearSelected(`post:${postId}`)
      startTransition(() => {
        refresh()
      })
    } catch (error) {
      dispatch({
        type: 'fail',
        message:
          error instanceof Error
            ? error.message
            : t('extracted.communities.modQueue.failedToRejectPost_05661041'),
      })
    } finally {
      dispatch({ type: 'stop' })
    }
  }

  async function handleResolveReport(
    report: CommunityModerationReport,
    status: 'reviewed' | 'dismissed',
  ) {
    dispatch({ type: 'start', id: report.id })
    try {
      await resolveCommunityModerationReport(communitySlug, report.id, status)
      dispatch({ type: 'report-resolved', reportId: report.id })
      clearSelected(`report:${report.id}`)
    } catch (error) {
      dispatch({
        type: 'fail',
        message:
          error instanceof Error
            ? error.message
            : t('extracted.communities.modQueue.failedToUpdateReport_61bf19b3'),
      })
    } finally {
      dispatch({ type: 'stop' })
    }
  }

  function handleWarnReport(reportId: string) {
    // The backend already resolved the report as 'actioned'; just remove it from the list.
    dispatch({ type: 'report-resolved', reportId })
    clearSelected(`report:${reportId}`)
  }

  function handleBanEvasionAction(reportId: string) {
    dispatch({ type: 'report-resolved', reportId })
    clearSelected(`report:${reportId}`)
  }

  function toggleSelected(key: SelectionKey) {
    if (mutationsDisabled) return
    setBulkMessage(null)
    setSelectedKeys(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function clearSelected(key: SelectionKey) {
    setSelectedKeys(current => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  function handleReportSortChange(value: ModerationReportSortParam) {
    const next = new URL(window.location.href).searchParams
    next.set('reportSort', isStaff ? value : communityModeratorVisibleReportSort(value))
    router.push(`?${next.toString()}`, { scroll: false })
  }

  function handleTabChange(value: string) {
    const tab = value as ActiveTab
    selectTab(tab)
    const next = new URL(window.location.href).searchParams
    next.set('tab', tab)
    router.push(`?${next.toString()}`, { scroll: false })
  }

  async function handleBulkConfirm(action: ModerationBulkAction) {
    const selected = new Set(selectedKeys)
    const operations: ModerationBulkOperation<SelectionKey>[] = []
    const skippedKeys = new Set<SelectionKey>()
    const normalizedBulkReason = bulkReason.trim().slice(0, 1000)
    const rejectPromises = new Map<string, Promise<void>>()
    const unpublishPromises = new Map<string, Promise<void>>()
    const deletePromises = new Map<string, Promise<void>>()

    const rejectPostOnce = (postId: string) => {
      const existing = rejectPromises.get(postId)
      if (existing) return existing
      const promise = rejectPost(communitySlug, postId, normalizedBulkReason)
      rejectPromises.set(postId, promise)
      return promise
    }

    const unpublishPostOnce = (postId: string) => {
      const existing = unpublishPromises.get(postId)
      if (existing) return existing
      const promise = unpublishCommunityPost(communitySlug, postId)
      unpublishPromises.set(postId, promise)
      return promise
    }

    const deleteCommentOnce = (commentId: string) => {
      const existing = deletePromises.get(commentId)
      if (existing) return existing
      const promise = deletePost(commentId)
      deletePromises.set(commentId, promise)
      return promise
    }

    for (const key of selected) {
      if (key.startsWith('post:')) {
        if (action === 'dismiss') {
          skippedKeys.add(key)
          continue
        }
        const postId = key.slice(5)
        operations.push({
          id: key,
          run: async () => {
            await rejectPostOnce(postId)
            dispatch({ type: 'post-resolved', postId })
          },
        })
      }
    }

    for (const key of selected) {
      if (!key.startsWith('report:')) continue
      const reportId = key.slice(7)
      const report = reportsById.get(reportId)
      if (!report) {
        skippedKeys.add(key)
        continue
      }

      if (report.status !== 'pending' || report.community_ban_evasion) {
        skippedKeys.add(key)
        continue
      }

      if (action === 'dismiss') {
        operations.push({
          id: key,
          run: async () => {
            await resolveCommunityModerationReport(communitySlug, report.id, 'dismissed')
            dispatch({ type: 'report-resolved', reportId: report.id })
          },
        })
        continue
      }

      if (report.entity_type === 'post' && report.target_pending_community_review === true) {
        operations.push({
          id: key,
          run: async () => {
            await rejectPostOnce(report.entity_id)
            dispatch({ type: 'post-resolved', postId: report.entity_id })
            await resolveCommunityModerationReport(communitySlug, report.id, 'reviewed')
            dispatch({ type: 'report-resolved', reportId: report.id })
          },
        })
      } else if (report.entity_type === 'post') {
        operations.push({
          id: key,
          run: async () => {
            await unpublishPostOnce(report.entity_id)
            await resolveCommunityModerationReport(communitySlug, report.id, 'reviewed')
            dispatch({ type: 'report-resolved', reportId: report.id })
          },
        })
      } else if (report.entity_type === 'comment') {
        operations.push({
          id: key,
          run: async () => {
            await deleteCommentOnce(report.entity_id)
            dispatch({ type: 'report-resolved', reportId: report.id })
          },
        })
      } else {
        skippedKeys.add(key)
      }
    }

    setBulkLoading(true)
    try {
      const failedKeys = await runModerationBulkOperations(operations)
      const remaining = new Set<SelectionKey>([...failedKeys, ...skippedKeys])
      const succeeded = operations.length - failedKeys.size
      setSelectedKeys(remaining)
      setBulkAction(null)
      setBulkMessage(
        formatModerationBulkMessage({
          succeeded,
          failed: failedKeys.size,
          skipped: skippedKeys.size,
        }),
      )
      if (succeeded > 0)
        startTransition(() => {
          refresh()
        })
    } finally {
      setBulkLoading(false)
    }
  }

  const reportsTabLabel =
    pendingReports.length > 0
      ? t('extracted.communities.modQueue.reportsCount_d0c7fbdc', { count: pendingReports.length })
      : t('extracted.communities.modQueue.reports_dacca3cb')
  const postsTabLabel =
    pendingPosts.length > 0
      ? t('extracted.communities.modQueue.postsCount_789e6251', { count: pendingPosts.length })
      : t('extracted.communities.modQueue.posts_a80811cf')
  const escalatedCount = escalatedReports.length + escalatedPosts.length
  const escalatedTabLabel =
    escalatedCount > 0
      ? t('extracted.communities.modQueue.escalatedCount_b112e49f', { count: escalatedCount })
      : t('extracted.communities.modQueue.escalated_b710aaaa')

  return (
    <ExposureCooldownGate cooldown={cooldown}>
      <div className='space-y-4'>
        {state.error && (
          <div className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>
            {state.error}
          </div>
        )}
        <BulkActionToolbar
          action={bulkAction}
          disabled={mutationsDisabled}
          message={bulkMessage}
          onActionChange={setBulkAction}
          onClearSelection={() => {
            setSelectedKeys(new Set())
            setBulkAction(null)
            setBulkMessage(null)
          }}
          onConfirm={handleBulkConfirm}
          onRemoveReasonChange={setBulkReason}
          removeReason={bulkReason}
          selectedCount={selectedKeys.size}
          showRemoveReason
        />
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
        >
          <TabsList data-pw='mod-queue-tabs'>
            <TabsTrigger
              value='reports'
              data-pw='mod-queue-tab-reports'
            >
              {reportsTabLabel}
            </TabsTrigger>
            <TabsTrigger
              value='posts'
              data-pw='mod-queue-tab-posts'
            >
              {postsTabLabel}
            </TabsTrigger>
            <TabsTrigger
              value='escalated'
              data-pw='mod-queue-tab-escalated'
            >
              {escalatedTabLabel}
            </TabsTrigger>
          </TabsList>

          <TabsContent value='reports'>
            {pendingReports.length > 0 ? (
              <section
                className='space-y-3'
                data-pw='mod-queue-reports'
              >
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <h3 className='text-sm font-semibold uppercase text-muted-foreground'>
                    {t('extracted.communities.modQueue.reports_dacca3cb')}
                  </h3>
                  <Select
                    value={effectiveReportSort}
                    onValueChange={handleReportSortChange}
                  >
                    <SelectTrigger
                      className='h-9 w-[180px]'
                      aria-label={t('extracted.communities.modQueue.sortReports_87711bde')}
                      data-pw='community-report-sort'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {isStaff && (
                        <SelectItem value='severity'>
                          {t('extracted.communities.modQueue.severity_5e9f9812')}
                        </SelectItem>
                      )}
                      <SelectItem value='most_reported'>
                        {t('extracted.communities.modQueue.mostReported_7838addd')}
                      </SelectItem>
                      <SelectItem value='created_at_asc'>
                        {t('extracted.communities.modQueue.oldestFirst_6e2ebdab')}
                      </SelectItem>
                      <SelectItem value='created_at_desc'>
                        {t('extracted.communities.modQueue.newestFirst_ffb6f576')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ModQueueReports
                  bulkDisabled={mutationsDisabled}
                  activeKey={activeKey}
                  communitySlug={communitySlug}
                  currentUserId={currentUserId}
                  isStaff={isStaff}
                  loading={state.loading}
                  onActiveChange={setActiveKey}
                  onBanEvasionAction={handleBanEvasionAction}
                  onResolve={handleResolveReport}
                  onWarn={handleWarnReport}
                  onSelectionToggle={reportId => toggleSelected(`report:${reportId}`)}
                  reports={pendingReports}
                  selectedIds={selectedReportIds}
                />
              </section>
            ) : (
              <p
                className='py-6 text-center text-sm text-muted-foreground'
                data-pw='mod-queue-reports-empty'
              >
                {t('extracted.communities.modQueue.noPendingReports_36379210')}
              </p>
            )}
          </TabsContent>

          <TabsContent value='posts'>
            {pendingPosts.length > 0 ? (
              <InfiniteScroll
                hasNextPage={hasNextPage}
                endCursor={endCursor}
                onLoadMore={loadMore}
                loadingMore={loadingMore}
                fetchError={fetchError}
                clearError={clearError}
                resetKey={resetKey}
              >
                <ModQueuePosts
                  activeAction={state.activeAction}
                  activeKey={activeKey}
                  bulkDisabled={mutationsDisabled}
                  communitySlug={communitySlug}
                  currentUserId={currentUserId}
                  loading={state.loading}
                  onActiveChange={setActiveKey}
                  onApprove={handleApprove}
                  onCancelReject={() => dispatch({ type: 'reject-cancelled' })}
                  onRejectStart={postId => dispatch({ type: 'reject-started', postId })}
                  onRejectSubmit={handleRejectSubmit}
                  onRejectionReasonChange={value =>
                    dispatch({ type: 'reject-reason-changed', value })
                  }
                  onSelectionToggle={postId => toggleSelected(`post:${postId}`)}
                  posts={pendingPosts}
                  rejectionReason={state.rejectionReason}
                  selectedIds={selectedPostIds}
                />
              </InfiniteScroll>
            ) : (
              <p
                className='py-6 text-center text-sm text-muted-foreground'
                data-pw='mod-queue-posts-empty'
              >
                {t('extracted.communities.modQueue.noPendingPosts_df860938')}
              </p>
            )}
          </TabsContent>

          <TabsContent value='escalated'>
            {escalatedCount === 0 ? (
              <p
                className='py-6 text-center text-sm text-muted-foreground'
                data-pw='mod-queue-escalated-empty'
              >
                {t('extracted.communities.modQueue.noEscalatedItems_3305d869')}
              </p>
            ) : (
              <div
                className='space-y-6'
                data-pw='mod-queue-escalated'
              >
                {escalatedReports.length > 0 && (
                  <section className='space-y-3'>
                    <h3 className='text-sm font-semibold uppercase text-muted-foreground'>
                      {t('extracted.communities.modQueue.escalatedReports_62af1d2c')}
                    </h3>
                    <ModQueueReports
                      bulkDisabled={mutationsDisabled}
                      activeKey={activeKey}
                      communitySlug={communitySlug}
                      currentUserId={currentUserId}
                      isStaff={isStaff}
                      loading={state.loading}
                      onActiveChange={setActiveKey}
                      onBanEvasionAction={handleBanEvasionAction}
                      onResolve={handleResolveReport}
                      onWarn={handleWarnReport}
                      onSelectionToggle={reportId => toggleSelected(`report:${reportId}`)}
                      reports={escalatedReports}
                      selectedIds={selectedReportIds}
                    />
                  </section>
                )}
                {escalatedPosts.length > 0 && (
                  <section className='space-y-3'>
                    <h3 className='text-sm font-semibold uppercase text-muted-foreground'>
                      {t('extracted.communities.modQueue.escalatedPosts_2404107b')}
                    </h3>
                    <ModQueuePosts
                      activeAction={state.activeAction}
                      activeKey={activeKey}
                      bulkDisabled={mutationsDisabled}
                      communitySlug={communitySlug}
                      currentUserId={currentUserId}
                      loading={state.loading}
                      onActiveChange={setActiveKey}
                      onApprove={handleApprove}
                      onCancelReject={() => dispatch({ type: 'reject-cancelled' })}
                      onRejectStart={postId => dispatch({ type: 'reject-started', postId })}
                      onRejectSubmit={handleRejectSubmit}
                      onRejectionReasonChange={value =>
                        dispatch({ type: 'reject-reason-changed', value })
                      }
                      onSelectionToggle={postId => toggleSelected(`post:${postId}`)}
                      posts={escalatedPosts}
                      rejectionReason={state.rejectionReason}
                      selectedIds={selectedPostIds}
                    />
                  </section>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
        {activeTab !== 'posts' ? (
          <InfiniteScroll
            hasNextPage={reportPagination.hasNextPage}
            endCursor={reportPagination.endCursor}
            onLoadMore={handleLoadMoreReports}
            loadingMore={reportPagination.loadingMore}
            fetchError={reportPagination.fetchError}
            clearError={reportPagination.clearError}
            resetKey={reportPagination.resetKey}
          >
            {null}
          </InfiniteScroll>
        ) : null}
      </div>
      <KeyboardShortcutsDialog
        description={t(
          'extracted.communities.modQueue.shortcutsForTheActiveModerationQueue_d1e2ea56',
        )}
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        shortcuts={MODERATION_QUEUE_SHORTCUTS}
        title={t('extracted.communities.modQueue.moderationShortcuts_47c378cf')}
        viewAllLink={false}
      />
    </ExposureCooldownGate>
  )
}
