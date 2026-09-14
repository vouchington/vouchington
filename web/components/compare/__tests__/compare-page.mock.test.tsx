import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createTranslator, type Translator } from '@ts-shared/ui-messages'
import { CompareDataInsights } from '../compare-data-insights'
import { ComparePage } from '../compare-page'
import type { Topic, TopicMetrics } from '@/types/topics'
import type { TopicDataPointInsights } from '@/types/topic-data-point-insights'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: React.ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

describe('ComparePage', () => {
  let t: Translator

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('formats compare counts and data insights with the resolved UI locale', () => {
    render(
      <ComparePage
        topicA={makeTopic({ id: 'topic-a', name: 'Alpha', slug: 'alpha' })}
        topicB={makeTopic({ id: 'topic-b', name: 'Beta', slug: 'beta' })}
        topicAPath='/topic/alpha'
        topicBPath='/topic/beta'
        metricsA={makeMetrics({
          ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 6250, '5': 6250 },
          reviews: 10_000,
          discussions: 20_000,
          dataPoints: 30_000,
        })}
        metricsB={makeMetrics({
          ratingCounts: { '1': 0, '2': 0, '3': 5000, '4': 0, '5': 10_000 },
          reviews: 40_000,
          discussions: 50_000,
          dataPoints: 60_000,
        })}
        insightsA={makeInsights({
          total_count: 70_000,
          approval_rate: 0.75,
          median_credit_limits: [
            { amount: 1_000_000, currency: 'usd' },
            { amount: 20_000, currency: 'jpy' },
          ],
        })}
        insightsB={makeInsights({
          total_count: 80_000,
          approval_rate: 0.5,
          median_credit_limits: [
            { amount: 1_500_000, currency: 'usd' },
            { amount: 30_000, currency: 'jpy' },
          ],
        })}
        uiLocale='de-DE'
        t={t}
      />,
    )

    expect(rowValues('Average Rating')).toEqual(['4,5 / 5', '4,3 / 5'])
    expect(rowValues('Total Ratings')).toEqual(['12.500', '15.000'])
    expect(rowValues('Reviews')).toEqual(['10.000', '40.000'])
    expect(rowValues('Discussions')).toEqual(['20.000', '50.000'])
    expect(rowValues('Data Points')).toEqual(['30.000', '60.000'])
    expect(rowValues('Total Data Points')).toEqual(['70.000', '80.000'])
    expect(rowValues('Approval Rate')).toEqual(['75\u00A0%', '50\u00A0%'])
    expect(rowValues('Median Credit Limit')).toEqual([
      '10.000,00\u00A0$, 20.000\u00A0¥',
      '15.000,00\u00A0$, 30.000\u00A0¥',
    ])
  })

  it('shows unavailable data insight values when nullable values are absent', () => {
    render(
      <CompareDataInsights
        topicA={makeTopic({ id: 'topic-a', name: 'Alpha', slug: 'alpha' })}
        topicB={makeTopic({ id: 'topic-b', name: 'Beta', slug: 'beta' })}
        insightsA={makeInsights({
          total_count: 1,
          approval_rate: null,
          median_credit_limits: [],
        })}
        insightsB={makeInsights({
          total_count: 2,
          approval_rate: null,
          median_credit_limits: [],
        })}
        uiLocale='de-DE'
        t={t}
      />,
    )

    expect(rowValues('Approval Rate')).toEqual(['N/A', 'N/A'])
    expect(rowValues('Median Credit Limit')).toEqual(['N/A', 'N/A'])
  })
})

function rowValues(label: string) {
  return within(screen.getByText(label).parentElement!)
    .getAllByText(/./, {
      selector: 'span.font-medium',
    })
    .map(element => element.textContent)
}

function makeTopic(overrides: Pick<Topic, 'id' | 'name' | 'slug'>): Topic {
  const user = {
    id: 'user-1',
    username: 'tester',
    display_name: 'Tester',
  }

  return {
    __entity_type: 'topic',
    id: overrides.id,
    name: overrides.name,
    slug: overrides.slug,
    markdown: '',
    aliases: [],
    topic_type: 'topic',
    noindex: false,
    allow_reviews: true,
    created_at: '2026-01-01T00:00:00.000Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: user,
    updated_by: user,
  }
}

function makeMetrics({
  ratingCounts,
  reviews,
  discussions,
  dataPoints,
}: {
  ratingCounts: TopicMetrics['ratings']['count']
  reviews: number
  discussions: number
  dataPoints: number
}): TopicMetrics {
  return {
    __entity_type: 'topic_metrics',
    id: `metrics-${reviews}`,
    count: {
      reviews,
      discussions,
      'data-points': dataPoints,
      news: 0,
      latest: 0,
    },
    ratings: {
      count: ratingCounts,
    },
    ratings__updated_at: '2026-01-01T00:00:00.000Z',
    bookmarks: {
      follow: 0,
    },
    bookmarks__updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function makeInsights(
  overrides: Pick<TopicDataPointInsights, 'total_count' | 'approval_rate' | 'median_credit_limits'>,
): TopicDataPointInsights {
  return {
    approved_count: 0,
    denied_count: 0,
    pending_count: 0,
    credit_score_distribution: {},
    ...overrides,
  }
}
