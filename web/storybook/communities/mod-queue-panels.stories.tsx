import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ModQueueEscalatedPanel } from '@/components/communities/mod-queue-escalated-panel'
import { ModQueuePostsPanel } from '@/components/communities/mod-queue-posts-panel'
import { ModQueueReportsPanel } from '@/components/communities/mod-queue-reports-panel'
import { ModQueueTabs } from '@/components/communities/mod-queue-tabs'
import { ModQueueView } from '@/components/communities/mod-queue-view'
import type { ModQueueData } from '@/components/communities/use-mod-queue-data'
import type { ModQueueItemActions } from '@/components/communities/use-mod-queue-item-actions'
import type { ModQueueSelection } from '@/components/communities/use-mod-queue-selection'
import {
  clearExposureStateFixture,
  setExposureStateFixture,
} from '@/storybook/mocks/moderation-exposure-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Mod Queue Panels',
  beforeEach() {
    setExposureStateFixture()
    return () => clearExposureStateFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const idle = fn()

const selection = {
  bulkAction: null,
  bulkMessage: null,
  bulkReason: '',
  mutationsDisabled: false,
  selectedKeys: new Set(),
  setBulkAction: idle,
  setBulkMessage: idle,
  setBulkReason: idle,
  setSelectedKeys: idle,
} as unknown as ModQueueSelection

const actions = {} as ModQueueItemActions

const queue = {
  clearError: idle,
  endCursor: null,
  fetchError: null,
  hasNextPage: false,
  loadMore: idle,
  loadingMore: false,
  resetKey: 0,
  pendingPosts: [],
  pendingReports: [],
  escalatedPosts: [],
  escalatedReports: [],
  posts: [],
  reports: [],
  reportPagination: { hasNextPage: false },
} as unknown as ModQueueData

const shared = {
  actions,
  activeKey: null,
  communitySlug: 'credit-cards',
  currentUserId: null,
  onActiveChange: idle,
  queue,
  selection,
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <div className='space-y-6'>
        <ModQueuePostsPanel {...shared} />
        <ModQueueReportsPanel {...shared} />
        <ModQueueEscalatedPanel {...shared} />
        <ModQueueTabs
          {...shared}
          activeTab='reports'
          onTabChange={idle}
        />
        <ModQueueView
          {...shared}
          activeTab='reports'
          onBulkConfirm={idle}
          onShortcutsOpenChange={idle}
          onTabChange={idle}
          shortcutsOpen={false}
        />
      </div>
    </StoryFrame>
  ),
}
