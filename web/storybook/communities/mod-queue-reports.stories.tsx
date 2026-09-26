import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ModQueueReports } from '@/components/communities/mod-queue-reports'
import type { CommunityModerationReport } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { posts } from '@/storybook/entities/fixtures/posts'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Mod Queue Reports',
  component: ModQueueReports,
} satisfies Meta<typeof ModQueueReports>

export default meta
type Story = StoryObj<typeof meta>

const discussion = posts[0]!

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
  note: 'Copied Sapphire Reserve referral with no spend categories.',
  status: 'pending',
  report_count: 3,
  resolved_by_id: null,
  judgement: {
    recommended_action: 'remove',
    public_response: 'This post reads like an unsolicited referral pitch.',
    internal_response: 'Referral link with no personal spend data.',
    is_stale: false,
    judged_report_count: 3,
    current_report_count: 3,
  },
  claim: null,
  escalated_at: null,
}

const shared = {
  communitySlug: communities[0]!.slug,
  currentUserId: storyCurrentUser.id,
  isStaff: true,
  loading: null,
  onResolve: () => {},
  onSelectionToggle: () => {},
  selectedIds: new Set<string>(),
}

export const ReferralReport: Story = {
  args: { ...shared, reports: [report] },
  render: args => (
    <StoryFrame>
      <ModQueueReports {...args} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  args: { ...shared, reports: [] },
  render: args => (
    <StoryFrame>
      <ModQueueReports {...args} />
    </StoryFrame>
  ),
}
