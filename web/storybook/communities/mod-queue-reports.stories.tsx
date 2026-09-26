import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ModQueueReports } from '@/components/communities/mod-queue-reports'
import type { CommunityModerationReport } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { posts } from '@/storybook/entities/fixtures/posts'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Mod Queue Reports',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

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

function Reports({ reports: initialReports }: { reports: CommunityModerationReport[] }) {
  const [reports, setReports] = useState(initialReports)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  return (
    <ModQueueReports
      communitySlug={communities[0]!.slug}
      currentUserId={storyCurrentUser.id}
      isStaff
      loading={null}
      onClaimToggle={reportId => {
        setReports(current =>
          current.map(item =>
            item.id === reportId
              ? {
                  ...item,
                  claim: item.claim
                    ? null
                    : {
                        id: 'claim-story',
                        community_id: communities[0]!.id,
                        report_id: item.id,
                        post_id: null,
                        claimed_by_id: storyCurrentUser.id,
                        claimed_at: '2026-09-26T00:00:00.000Z',
                        released_at: null,
                      },
                }
              : item,
          ),
        )
      }}
      onEscalateToggle={(reportId, escalated) => {
        setReports(current =>
          current.map(item =>
            item.id === reportId
              ? { ...item, escalated_at: escalated ? '2026-09-26T00:00:00.000Z' : null }
              : item,
          ),
        )
      }}
      onResolve={report => {
        setReports(current => current.filter(item => item.id !== report.id))
      }}
      onSelectionToggle={reportId => {
        setSelectedIds(current => {
          const next = new Set(current)
          if (next.has(reportId)) next.delete(reportId)
          else next.add(reportId)
          return next
        })
      }}
      onWarn={reportId => {
        setReports(current => current.filter(item => item.id !== reportId))
      }}
      reports={reports}
      selectedIds={selectedIds}
    />
  )
}

export const ReferralReport: Story = {
  render: () => (
    <StoryFrame>
      <Reports reports={[report]} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <Reports reports={[]} />
    </StoryFrame>
  ),
}
