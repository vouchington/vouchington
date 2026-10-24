import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator } from '@ts-shared/ui-messages'
import { ComparePage } from '@/components/compare/compare-page'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { TopicMetrics } from '@/types/topics'
import type { TopicDataPointInsights } from '@/types/topic-data-point-insights'

const t = createTranslator('en', await loadJsonMessages('en'))
const card = topics[1]!
const account = topics[2]!

const cardMetrics: TopicMetrics = {
  __entity_type: 'topic_metrics',
  id: 'card-metrics',
  count: { reviews: 128, discussions: 42, 'data-points': 91, news: 0, latest: 0 },
  ratings: { count: { '1': 2, '2': 4, '3': 8, '4': 28, '5': 86 } },
  ratings__updated_at: '2026-01-01T00:00:00.000Z',
  bookmarks: { follow: 0 },
  bookmarks__updated_at: '2026-01-01T00:00:00.000Z',
}
const accountMetrics: TopicMetrics = {
  ...cardMetrics,
  id: 'account-metrics',
  count: { reviews: 53, discussions: 17, 'data-points': 44, news: 0, latest: 0 },
  ratings: { count: { '1': 1, '2': 2, '3': 5, '4': 19, '5': 26 } },
}
const cardInsights: TopicDataPointInsights = {
  total_count: 91,
  approved_count: 68,
  denied_count: 18,
  pending_count: 5,
  approval_rate: 0.75,
  credit_score_distribution: {},
  median_credit_limits: [{ amount: 1_200_000, currency: 'usd' }],
}
const accountInsights: TopicDataPointInsights = {
  ...cardInsights,
  total_count: 44,
  approved_count: 31,
  denied_count: 10,
  pending_count: 3,
  approval_rate: 0.7,
  median_credit_limits: [{ amount: 800_000, currency: 'usd' }],
}

const meta = {
  title: 'Compare/Compare Page',
  component: ComparePage,
} satisfies Meta<typeof ComparePage>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {
  args: {
    topicA: card,
    topicB: account,
    topicAPath: '/topic/sapphire-reserve',
    topicBPath: '/topic/high-yield-savings',
    metricsA: cardMetrics,
    metricsB: accountMetrics,
    electionA: {
      __entity_type: 'topic_election',
      id: 'card-election',
      votes_score_net: 110,
      votes_count_up: 119,
      votes_count_down: 9,
    },
    electionB: {
      __entity_type: 'topic_election',
      id: 'account-election',
      votes_score_net: 35,
      votes_count_up: 41,
      votes_count_down: 6,
    },
    insightsA: cardInsights,
    insightsB: accountInsights,
    uiLocale: 'en-US',
    t,
  },
  render: args => (
    <StoryFrame width='max-w-5xl'>
      <ComparePage {...args} />
    </StoryFrame>
  ),
}
