import { makeItem, makeStory } from '@/test-helpers/components/news/news-item-cluster.mock-support'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewsItemCluster } from '../news-item-cluster'
import type { RssFeedItemElection } from '@/types/rss-feed-items'

const makeElection = (id: string): RssFeedItemElection => ({
  __entity_type: 'rss_feed_item_election',
  id,
  votes_score_net: 0,
  votes_count_up: 0,
  votes_count_down: 0,
})

const primary = makeItem('item-1', 'Primary Article')
const storyItem1 = makeItem('item-2', 'Related Article 1')
const storyItem2 = makeItem('item-3', 'Related Article 2')

describe('NewsItemCluster story expand/collapse interactions', () => {
  it('shows "N related articles" button when story items exist', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1, storyItem2]}
        story={makeStory()}
        view='summary'
      />,
    )
    expect(screen.getByText('Primary Article')).toBeDefined()
    expect(screen.getByRole('button', { name: /2 related articles/i })).toBeDefined()
  })

  it('uses singular "1 related article" for single story item', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1]}
        story={makeStory()}
        view='summary'
      />,
    )
    expect(screen.getByRole('button', { name: /1 related article$/i })).toBeDefined()
  })

  it('expands to show story items on click', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1, storyItem2]}
        story={makeStory()}
        view='summary'
      />,
    )
    expect(screen.getByText('Related Article 1')).not.toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /2 related articles/i }))
    expect(screen.getByText('Related Article 1')).toBeVisible()
    expect(screen.getByText('Related Article 2')).toBeVisible()
    expect(screen.getByRole('button', { name: /2 related articles/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('collapses story items on second click', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1, storyItem2]}
        story={makeStory()}
        view='summary'
      />,
    )
    const button = screen.getByRole('button', { name: /2 related articles/i })

    fireEvent.click(button)
    expect(screen.getByText('Related Article 1')).toBeVisible()

    fireEvent.click(button)
    expect(screen.getByText('Related Article 1')).not.toBeVisible()
  })

  it('renders action row with voting when election exists', async () => {
    const primaryElection: RssFeedItemElection = {
      ...makeElection('election-1'),
      votes_score_net: 5,
      votes_count_up: 7,
      votes_count_down: 2,
    }
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        primaryElection={primaryElection}
        storyItems={[]}
        view='summary'
        relatedPosts={[]}
      />,
    )
    expect(container.querySelector('.scrollbar-hide')).not.toBeNull()
    await waitFor(() => {
      expect(screen.getByTestId('news-item-vote')).toBeDefined()
    })
  })

  it('renders an action row for each expanded story item', () => {
    const story = makeStory()
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1]}
        story={story}
        view='summary'
        relatedPosts={[]}
        storyItemActionContexts={{
          [storyItem1.id]: {
            relatedPosts: [],
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 related article/i }))

    expect(container.querySelectorAll('[data-pw="news-item-actions-row"]')).toHaveLength(2)
  })

  it('forwards the primary election vote choice to ScoreVote', async () => {
    const primaryElection: RssFeedItemElection = {
      ...makeElection('election-1'),
      votes_score_net: 5,
      votes_count_up: 7,
      votes_count_down: 2,
    }
    render(
      <NewsItemCluster
        primary={primary}
        primaryElection={primaryElection}
        primaryElectionVote={{
          __entity_type: 'election_vote',
          entity_id: primary.id,
          user_id: 'user-1',
          choice: 'vouch',
          created_at: '2026-01-01T00:00:00Z',
        }}
        storyItems={[]}
        view='summary'
        relatedPosts={[]}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('existing-vote-choice').textContent).toBe('vouch')
      expect(screen.getByTestId('entity-type').textContent).toBe('rss_feed_item')
    })
  })
})
