import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ModQueuePostCard } from '@/components/communities/mod-queue-post-card'
import { ModQueuePostCardActions } from '@/components/communities/mod-queue-post-card-actions'
import { ModQueueReportCard } from '@/components/communities/mod-queue-report-card'
import { ModQueueReportCardActions } from '@/components/communities/mod-queue-report-card-actions'
import type { ModQueuePostActions } from '@/components/communities/use-mod-queue-post-actions'
import type { ModQueueReportActions } from '@/components/communities/use-mod-queue-report-actions'
import type { CommunityModerationReport, CommunityPostsResponseBody } from '@/types/api-responses'
import { posts } from '@/storybook/entities/fixtures/posts'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Mod Queue Cards',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const idle = fn()
const discussion = posts[0]!

const pendingPost = {
  id: discussion.id,
  title: discussion.title,
  markdown: discussion.markdown,
  created_at: discussion.created_at,
  declared_language: 'en',
  lingua_rs_detected_language: 'en',
  claim: null,
  escalated_at: null,
} as CommunityPostsResponseBody['posts'][string]

const report: CommunityModerationReport = {
  id: 'report-referral-pitch',
  created_at: '2026-05-25T12:00:00.000Z',
  reviewed_at: null,
  entity_type: 'post',
  entity_id: discussion.id,
  admin_action_path: `/discussion/${discussion.id}`,
  target_label: discussion.title,
  target_content: {
    kind: 'post',
    text: discussion.title,
    declared_language: 'en',
    lingua_rs_detected_language: 'en',
  },
  target_path: `/discussion/${discussion.id}`,
  target_user_id: publicUsers[0]!.id,
  reason: 'spam',
  note: 'Copied referral pitch.',
  status: 'pending',
  report_count: 1,
  resolved_by_id: null,
  claim: null,
  escalated_at: null,
}

const postActions = {
  claimingId: null,
  discussingId: null,
  escalatingId: null,
  handleClaim: idle,
  handleDeEscalate: idle,
  handleDiscuss: idle,
  handleEscalate: idle,
  handleRelease: idle,
} as unknown as ModQueuePostActions

const reportActions = {
  claimingId: null,
  discussingId: null,
  escalatingId: null,
  handleClaim: idle,
  handleDeEscalate: idle,
  handleDiscuss: idle,
  handleEscalate: idle,
  handleRelease: idle,
  handleSendModmail: idle,
  sendingModmail: null,
} as unknown as ModQueueReportActions

const postCardProps = {
  activeAction: null,
  bulkDisabled: false,
  currentUserId: null,
  loading: null,
  onApprove: idle,
  onCancelReject: idle,
  onRejectStart: idle,
  onRejectSubmit: idle,
  onRejectionReasonChange: idle,
  post: pendingPost,
  postActions,
  rejectionReason: '',
}

export const Cards: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <div className='space-y-4'>
        <ModQueuePostCard
          {...postCardProps}
          activeKey={null}
          onActiveChange={idle}
          onSelectionToggle={idle}
          selected={false}
        />
        <ModQueuePostCardActions {...postCardProps} />
        <ModQueueReportCard
          activeKey={null}
          bulkDisabled={false}
          communitySlug='credit-cards'
          currentUserId={null}
          isStaff={false}
          loading={null}
          onActiveChange={idle}
          onResolve={idle}
          onSelectionToggle={idle}
          report={report}
          reportActions={reportActions}
          selected={false}
        />
        <ModQueueReportCardActions
          bulkDisabled={false}
          communitySlug='credit-cards'
          currentUserId={null}
          isStaff={false}
          loading={null}
          onResolve={idle}
          report={report}
          reportActions={reportActions}
        />
      </div>
    </StoryFrame>
  ),
}
