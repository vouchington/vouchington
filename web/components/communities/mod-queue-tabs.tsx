'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ModQueueEscalatedPanel } from './mod-queue-escalated-panel'
import { ModQueuePostsPanel } from './mod-queue-posts-panel'
import { ModQueueReportsPanel } from './mod-queue-reports-panel'
import type { ModQueueTab } from './mod-queue-state'
import type { ModQueueData } from './use-mod-queue-data'
import type { ModQueueItemActions } from './use-mod-queue-item-actions'
import type { ModQueueSelection } from './use-mod-queue-selection'

export function ModQueueTabs({
  actions,
  activeKey,
  activeTab,
  communitySlug,
  currentUserId,
  onActiveChange,
  onTabChange,
  queue,
  selection,
}: {
  actions: ModQueueItemActions
  activeKey: string | null
  activeTab: ModQueueTab
  communitySlug: string
  currentUserId: string | null
  onActiveChange: (key: string) => void
  onTabChange: (value: string) => void
  queue: ModQueueData
  selection: ModQueueSelection
}) {
  const t = useTranslations()
  const reportsTabLabel =
    queue.pendingReports.length > 0
      ? t('extracted.communities.modQueue.reportsCount_d0c7fbdc', {
          count: queue.pendingReports.length,
        })
      : t('extracted.communities.modQueue.reports_dacca3cb')
  const postsTabLabel =
    queue.pendingPosts.length > 0
      ? t('extracted.communities.modQueue.postsCount_789e6251', {
          count: queue.pendingPosts.length,
        })
      : t('extracted.communities.modQueue.posts_a80811cf')
  const escalatedCount = queue.escalatedReports.length + queue.escalatedPosts.length
  const escalatedTabLabel =
    escalatedCount > 0
      ? t('extracted.communities.modQueue.escalatedCount_b112e49f', { count: escalatedCount })
      : t('extracted.communities.modQueue.escalated_b710aaaa')
  const panelProps = {
    actions,
    activeKey,
    communitySlug,
    currentUserId,
    onActiveChange,
    queue,
    selection,
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={onTabChange}
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
        <ModQueueReportsPanel {...panelProps} />
      </TabsContent>
      <TabsContent value='posts'>
        <ModQueuePostsPanel {...panelProps} />
      </TabsContent>
      <TabsContent value='escalated'>
        <ModQueueEscalatedPanel {...panelProps} />
      </TabsContent>
    </Tabs>
  )
}
