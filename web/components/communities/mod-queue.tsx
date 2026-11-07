'use client'

import type { ModerationBulkAction } from '@/components/moderation/bulk-action-toolbar'
import { useModerationQueueHotkeys } from '@/components/moderation/use-moderation-queue-hotkeys'
import type { ModerationReportSortParam } from '@/lib/api/client/reports'
import type {
  CommunityModerationReportsResponseBody,
  CommunityPostsResponseBody,
} from '@/types/api-responses'
import { confirmModQueueBulk } from './mod-queue-bulk'
import { ModQueueView } from './mod-queue-view'
import type { ModQueueSelectionKey, ModQueueTab } from './mod-queue-state'
import { useModQueueData } from './use-mod-queue-data'
import { useModQueueItemActions } from './use-mod-queue-item-actions'
import { useModQueueSelection } from './use-mod-queue-selection'

interface ModQueueProps {
  data: CommunityPostsResponseBody
  reportsData?: CommunityModerationReportsResponseBody
  communitySlug: string
  currentUserId?: string | null
  isStaff?: boolean
  reportSort?: ModerationReportSortParam
  activeTab?: ModQueueTab
  activeTabIsExplicit?: boolean
}

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
  const queue = useModQueueData({
    communitySlug,
    data,
    isStaff,
    reportSort,
    reportsData,
  })
  const selection = useModQueueSelection({
    isPending: queue.isPending,
    loading: queue.state.loading,
  })
  const actions = useModQueueItemActions({
    clearSelected: selection.clearSelected,
    communitySlug,
    dispatch: queue.dispatch,
    refresh: queue.refresh,
    rejectionReason: queue.state.rejectionReason,
    startTransition: queue.startTransition,
  })
  const hotkeyItems = [
    ...queue.reports.flatMap(report =>
      report.community_ban_evasion
        ? []
        : [
            {
              key: `report:${report.id}`,
              tab: report.escalated_at ? ('escalated' as const) : ('reports' as const),
              onDismiss: () => actions.handleResolveReport(report, 'dismissed'),
              onReview: () => actions.handleResolveReport(report, 'reviewed'),
            },
          ],
    ),
    ...queue.posts.map(post => ({
      key: `post:${post.id}`,
      tab: post.escalated_at ? ('escalated' as const) : ('posts' as const),
      onApprove: () => actions.handleApprove(post.id),
      onRemove: () => actions.handleRejectImmediate(post.id),
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
    disabled: selection.mutationsDisabled,
    fallbackTab: queue.fallbackActiveTab,
    initialTab: initialActiveTab,
    initialTabIsExplicit: activeTabIsExplicit,
    items: hotkeyItems,
    onSelectionToggle: key => selection.toggleSelected(key as ModQueueSelectionKey),
  })

  function handleTabChange(value: string) {
    const tab = value as ModQueueTab
    selectTab(tab)
    const next = new URL(window.location.href).searchParams
    next.set('tab', tab)
    queue.router.push(`?${next.toString()}`, { scroll: false })
  }

  function handleBulkConfirm(action: ModerationBulkAction) {
    return confirmModQueueBulk({
      action,
      communitySlug,
      queue,
      selection,
    })
  }

  return (
    <ModQueueView
      actions={actions}
      activeKey={activeKey}
      activeTab={activeTab}
      communitySlug={communitySlug}
      currentUserId={currentUserId}
      onActiveChange={setActiveKey}
      onBulkConfirm={handleBulkConfirm}
      onShortcutsOpenChange={setShortcutsOpen}
      onTabChange={handleTabChange}
      queue={queue}
      selection={selection}
      shortcutsOpen={shortcutsOpen}
    />
  )
}
