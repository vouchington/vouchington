import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ModerationAnalyticsDashboard from '@/components/admin/moderation-analytics/moderation-analytics-dashboard'
import { StoryFrame } from '@/storybook/story-frame'
import type { ModerationAnalytics } from '@/types/moderation-analytics'

const moderationMetrics: ModerationAnalytics = {
  range: '30d',
  period_start: '2026-04-26T00:00:00.000Z',
  period_end: '2026-05-26T00:00:00.000Z',
  scope: { type: 'global' },
  queue_volume: {
    total_reports: 128,
    pending_reports: 14,
    reports_over_time: [
      { date: '2026-05-24', count: 6 },
      { date: '2026-05-25', count: 9 },
      { date: '2026-05-26', count: 4 },
    ],
    clearance_actions_over_time: [
      { date: '2026-05-25', type: 'approved', count: 40 },
      { date: '2026-05-25', type: 'rejected', count: 3 },
    ],
    moderator_actions_over_time: [
      { date: '2026-05-25', type: 'remove', count: 5 },
      { date: '2026-05-25', type: 'warn', count: 2 },
    ],
  },
  rule_violations: {
    reasons: [
      { reason: 'spam', count: 22 },
      { reason: 'harassment', count: 7 },
    ],
    reasons_over_time: [{ date: '2026-05-25', type: 'spam', count: 4 }],
  },
  automod_performance: {
    total_actions: 86,
    auto_removes: 19,
    reviewed_count: 40,
    false_positive_count: 3,
    false_positive_rate: 0.075,
    actions_over_time: [
      { date: '2026-05-25', type: 'auto_remove', count: 4 },
      { date: '2026-05-25', type: 'flag', count: 7 },
    ],
    confidence_distribution: [
      { bucket: '0.8-0.9', count: 12 },
      { bucket: '0.9-1.0', count: 31 },
    ],
    sources: [
      { source_type: 'agent', count: 60 },
      { source_type: 'rule', count: 26 },
    ],
  },
  moderator_workload: {
    moderators: [
      {
        actor_id: 'user-alex',
        total: 18,
        counts: { remove: 11, warn: 7 },
        weekly_counts: [{ date: '2026-05-25', type: 'remove', count: 3 }],
      },
    ],
    users: { 'user-alex': { username: 'alex' } },
  },
  appeals: {
    total_closed: 12,
    accepted: 4,
    reduced: 2,
    denied: 6,
    dismissed: 0,
    success_rate: 0.5,
  },
  new_user_friction: {
    first_posts: 80,
    rejected_first_posts: 6,
    rejection_rate: 0.075,
  },
}

const emptyPeriod: ModerationAnalytics = {
  ...moderationMetrics,
  queue_volume: {
    total_reports: 0,
    pending_reports: 0,
    reports_over_time: [],
    clearance_actions_over_time: [],
    moderator_actions_over_time: [],
  },
  rule_violations: { reasons: [], reasons_over_time: [] },
  automod_performance: {
    ...moderationMetrics.automod_performance,
    total_actions: 0,
    auto_removes: 0,
    reviewed_count: 0,
    false_positive_count: 0,
    false_positive_rate: null,
    actions_over_time: [],
    confidence_distribution: [],
    sources: [],
  },
  moderator_workload: { moderators: [], users: {} },
  appeals: {
    total_closed: 0,
    accepted: 0,
    reduced: 0,
    denied: 0,
    dismissed: 0,
    success_rate: null,
  },
  new_user_friction: { first_posts: 0, rejected_first_posts: 0, rejection_rate: null },
}

const meta = {
  title: 'Admin/Moderation Analytics Dashboard',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Last30Days: Story = {
  render: () => (
    <StoryFrame width='max-w-6xl'>
      <ModerationAnalyticsDashboard
        metrics={moderationMetrics}
        basePath='/admin/moderation-analytics'
        title='Moderation analytics'
        description='Reports, automod actions, and appeals for credit card discussions.'
      />
    </StoryFrame>
  ),
}

export const EmptyPeriod: Story = {
  render: () => (
    <StoryFrame width='max-w-6xl'>
      <ModerationAnalyticsDashboard
        metrics={emptyPeriod}
        basePath='/admin/moderation-analytics'
        title='Moderation analytics'
        description='No reports were filed during this range.'
      />
    </StoryFrame>
  ),
}
