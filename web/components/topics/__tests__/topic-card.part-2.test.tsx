import { beforeEach, describe, expect, it } from 'vitest'

import {
  mockMetrics,
  mockTopic,
  setTopicCardUser,
} from '@/test-helpers/components/topics/topic-card.mock-support'

import { render, screen } from '@testing-library/react'

import { TopicCard } from '../topic-card'

import type { TopicElection, TopicMetrics } from '@/types/topics'

describe('TopicCard', () => {
  beforeEach(() => {
    setTopicCardUser(null)
  })

  const mockElection: TopicElection = {
    __entity_type: 'topic_election',
    id: 'topic-election-1',
    votes_score_net: 5,
    votes_count_up: 12,
    votes_count_down: 7,
  }

  it('does not render vouch/disavow text counts even when election has non-zero counts', () => {
    render(
      <TopicCard
        topic={mockTopic}
        metrics={mockMetrics}
        election={mockElection}
      />,
    )
    expect(screen.queryByText(/12 vouches/)).toBeNull()
    expect(screen.queryByText(/7 disavows/)).toBeNull()
  })

  it('handles zero ratings gracefully', () => {
    const noRatingsMetrics: TopicMetrics = {
      ...mockMetrics,
      ratings: {
        count: {
          '1': 0,
          '2': 0,
          '3': 0,
          '4': 0,
          '5': 0,
        },
      },
    }

    render(
      <TopicCard
        topic={mockTopic}
        metrics={noRatingsMetrics}
      />,
    )
    expect(screen.queryByText('★')).toBeNull()
  })

  it('renders link to topic detail page', () => {
    const { container } = render(<TopicCard topic={mockTopic} />)
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/card/chase-sapphire-reserve')
  })

  it('does not render a letter placeholder when logo_image_id is null', () => {
    render(<TopicCard topic={mockTopic} />)
    expect(screen.queryByText('C')).toBeNull()
  })

  it('renders topic logo image when its placement is publicly projected', () => {
    render(
      <TopicCard
        topic={{
          ...mockTopic,
          logo_image_id: 'img-abc123',
          logo_image_placement: {
            placement_id: 'placement-abc123',
            placement_revision: 1,
            image_id: 'img-abc123',
          },
        }}
      />,
    )
    const logo = screen.getByRole('img', { name: 'Chase Sapphire Reserve logo' })
    expect(logo).not.toBeNull()
  })
})
