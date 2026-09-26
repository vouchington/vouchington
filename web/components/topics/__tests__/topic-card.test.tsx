import { beforeEach, describe, expect, it } from 'vitest'

import {
  mockMetrics,
  mockTopic,
  setTopicCardUser,
} from '@/test-helpers/components/topics/topic-card.mock-support'

import { render, screen } from '@testing-library/react'

import { TopicCard } from '../topic-card'

describe('TopicCard', () => {
  beforeEach(() => {
    setTopicCardUser(null)
  })

  it('renders topic name', () => {
    const { container } = render(<TopicCard topic={mockTopic} />)
    expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined()
    expect(container.querySelector('[data-pw="topic-card"]')).not.toBeNull()
  })

  it('renders topic type badge below the title', () => {
    const { container } = render(<TopicCard topic={mockTopic} />)
    const title = container.querySelector('h3')!
    const badge = screen.getByText('Card')
    expect(badge).toBeDefined()
    // Badge must appear after the title in DOM order
    expect(title.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders topic description', () => {
    render(<TopicCard topic={mockTopic} />)
    expect(screen.getByText(/Premium travel rewards/)).toBeDefined()
  })

  it('renders average rating when metrics provided', () => {
    render(
      <TopicCard
        topic={mockTopic}
        metrics={mockMetrics}
      />,
    )
    // Average rating = (0*1 + 1*2 + 2*3 + 5*4 + 12*5) / 20 = 4.4
    expect(screen.getByText('4.4')).toBeDefined()
  })

  it('renders review count', () => {
    render(
      <TopicCard
        topic={mockTopic}
        metrics={mockMetrics}
      />,
    )
    // Total reviews = 0 + 1 + 2 + 5 + 12 = 20
    expect(screen.getByText(/20 reviews/)).toBeDefined()
  })

  it('renders follower count', () => {
    render(
      <TopicCard
        topic={mockTopic}
        metrics={mockMetrics}
      />,
    )
    expect(screen.getByText(/150 followers/)).toBeDefined()
  })

  describe('hideBookmarkActions', () => {
    it('suppresses FollowButton and mute EntityBookmarkButton when hideBookmarkActions=true', () => {
      setTopicCardUser({ id: 'user-1', roles: [] })
      render(
        <TopicCard
          topic={mockTopic}
          hideBookmarkActions
        />,
      )
      expect(screen.queryByTestId('follow-button')).toBeNull()
      expect(screen.queryByTestId('mute-button')).toBeNull()
    })

    it('renders FollowButton and mute EntityBookmarkButton when hideBookmarkActions=false and signed in', async () => {
      setTopicCardUser({ id: 'user-1', roles: [] })
      render(
        <TopicCard
          topic={mockTopic}
          hideBookmarkActions={false}
        />,
      )
      expect(await screen.findByTestId('follow-button')).toBeDefined()
      expect(await screen.findByTestId('mute-button')).toBeDefined()
    })
  })
})
