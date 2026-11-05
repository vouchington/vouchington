import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ModerationAnalyticsCharts } from '@/components/admin/moderation-analytics/moderation-analytics-charts'
import { ModerationAnalyticsRankedLists } from '@/components/admin/moderation-analytics/moderation-analytics-ranked-lists'
import { ModerationAnalyticsSummary } from '@/components/admin/moderation-analytics/moderation-analytics-summary'
import { ModerationAnalyticsWorkload } from '@/components/admin/moderation-analytics/moderation-analytics-workload'
import type { ModerationAnalytics } from '@/types/moderation-analytics'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Admin/Moderation Analytics Sections',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const metrics: ModerationAnalytics = {
  range: '30d',
  period_start: '2026-04-26T00:00:00.000Z',
  period_end: '2026-05-26T00:00:00.000Z',
  scope: { type: 'global' },
  queue_volume: {
    total_reports: 1,
    pending_reports: 0,
    reports_over_time: [{ date: '2026-05-26', count: 1 }],
    clearance_actions_over_time: [],
    moderator_actions_over_time: [],
  },
  rule_violations: {
    reasons: [{ reason: 'spam', count: 1 }],
    reasons_over_time: [],
  },
  automod_performance: {
    total_actions: 1,
    auto_removes: 0,
    reviewed_count: 1,
    false_positive_count: 0,
    false_positive_rate: 0,
    actions_over_time: [{ date: '2026-05-26', type: 'flag', count: 1 }],
    confidence_distribution: [],
    sources: [{ source_type: 'agent', count: 1 }],
  },
  moderator_workload: { moderators: [], users: {} },
  appeals: {
    total_closed: 0,
    accepted: 0,
    reduced: 0,
    denied: 0,
    success_rate: null,
  },
  new_user_friction: {
    first_posts: 0,
    rejected_first_posts: 0,
    rejection_rate: null,
  },
}

export const Sections: Story = {
  render: () => (
    <StoryFrame width='max-w-6xl'>
      <div className='space-y-4'>
        <ModerationAnalyticsSummary metrics={metrics} />
        <ModerationAnalyticsCharts metrics={metrics} />
        <ModerationAnalyticsRankedLists metrics={metrics} />
        <ModerationAnalyticsWorkload metrics={metrics} />
      </div>
    </StoryFrame>
  ),
}
