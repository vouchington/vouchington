import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ModQueue } from '@/components/communities/mod-queue'
import { ModQueuePosts } from '@/components/communities/mod-queue-posts'
import { BulkActionToolbar } from '@/components/moderation/bulk-action-toolbar'
import { ModQueueWarnButton } from '@/components/communities/mod-queue-warn-button'
import type {
  CommunityModerationReportsResponseBody,
  CommunityPostsResponseBody,
} from '@/types/api-responses'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Communities/ModQueue',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const emptyData: CommunityPostsResponseBody = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: {},
  posts_metrics: {},
}

const emptyReports: CommunityModerationReportsResponseBody = {
  reports: [],
}

const pendingPost1 = {
  id: 'pending-post-1',
  title: 'My first year with Sapphire Reserve',
  markdown:
    'After switching from the Gold card last spring, I quickly discovered the travel credits make the annual fee worthwhile. Here are the categories I found most valuable.',
  created_at: '2026-05-20T09:15:00.000Z',
}
const pendingPost2 = {
  id: 'pending-post-2',
  title: 'Approved for Chase Freedom Unlimited — 760 score, 5yr history',
  markdown:
    'Applied online at 8am EST and received an instant approval. Credit limit came in at $8,500.',
  created_at: '2026-05-22T14:30:00.000Z',
}
const pendingPost3 = {
  id: 'pending-post-3',
  title: 'Best transfer partners for Amex points right now',
  markdown: null,
  created_at: '2026-05-24T07:00:00.000Z',
}

const withPostsData: CommunityPostsResponseBody = {
  results: [
    { __entity_type: 'post', id: pendingPost1.id },
    { __entity_type: 'post', id: pendingPost2.id },
    { __entity_type: 'post', id: pendingPost3.id },
  ],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: {
    [pendingPost1.id]: pendingPost1 as unknown as CommunityPostsResponseBody['posts'][string],
    [pendingPost2.id]: pendingPost2 as unknown as CommunityPostsResponseBody['posts'][string],
    [pendingPost3.id]: pendingPost3 as unknown as CommunityPostsResponseBody['posts'][string],
  },
  posts_metrics: {},
}

const withReportsData: CommunityModerationReportsResponseBody = {
  reports: [
    {
      id: 'report-1',
      created_at: '2026-05-25T12:00:00.000Z',
      reviewed_at: null,
      entity_type: 'post',
      entity_id: pendingPost1.id,
      target_content: null,
      target_label: pendingPost1.title,
      target_path: `/discussion/${pendingPost1.id}`,
      admin_action_path: `/discussion/${pendingPost1.id}`,
      reason: 'spam',
      note: 'Looks like a copied referral pitch.',
      status: 'pending',
      report_count: 1,
      resolved_by_id: null,
    },
  ],
}

export const Empty: Story = {
  render: () => (
    <EntityStoryFrame
      title='Mod Queue — Empty'
      description='No posts pending review.'
    >
      <ModQueue
        data={emptyData}
        reportsData={emptyReports}
        communitySlug='credit-cards'
      />
    </EntityStoryFrame>
  ),
}

export const WithPendingPosts: Story = {
  render: () => (
    <EntityStoryFrame
      title='Mod Queue — Pending posts'
      description='Three posts awaiting moderator review.'
    >
      <ModQueue
        data={withPostsData}
        reportsData={withReportsData}
        communitySlug='credit-cards'
      />
    </EntityStoryFrame>
  ),
}

export const Posts: Story = {
  render: () => (
    <EntityStoryFrame
      title='Mod Queue Posts'
      description='Pending posts list inside the moderator queue.'
    >
      <ModQueuePosts
        activeAction={null}
        activeKey='post:pending-post-1'
        communitySlug='credit-cards'
        loading={null}
        onActiveChange={fn()}
        onApprove={fn()}
        onCancelReject={fn()}
        onRejectStart={fn()}
        onRejectSubmit={fn()}
        onRejectionReasonChange={fn()}
        onSelectionToggle={fn()}
        posts={Object.values(withPostsData.posts)}
        rejectionReason=''
        selectedIds={new Set()}
      />
    </EntityStoryFrame>
  ),
}

export const BulkActions: Story = {
  render: () => (
    <EntityStoryFrame
      title='Mod Queue Bulk Actions'
      description='Bulk moderation action toolbar for selected reports.'
    >
      <BulkActionToolbar
        action='remove'
        message='Keyboard shortcut selection uses the same bulk action toolbar.'
        removeReason='Duplicate referral spam.'
        selectedCount={3}
        showRemoveReason
        onActionChange={fn()}
        onClearSelection={fn()}
        onConfirm={fn()}
        onRemoveReasonChange={fn()}
      />
    </EntityStoryFrame>
  ),
}

export const WarnButtonStory: Story = {
  render: () => (
    <EntityStoryFrame
      title='Mod Queue Warn Button'
      description='Warn action button in the community mod queue report card.'
    >
      <ModQueueWarnButton
        userId='user-1'
        communitySlug='credit-cards'
        reportId='report-1'
      />
    </EntityStoryFrame>
  ),
}
