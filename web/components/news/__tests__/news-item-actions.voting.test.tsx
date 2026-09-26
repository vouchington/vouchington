import { beforeEach, describe, expect, it } from 'vitest'

import {
  MOCK_ITEM,
  mockAuthState,
  mockSubmitRssFeedItemVote,
  renderNewsItemActions,
} from '@/test-helpers/components/news/news-item-actions-voting.mock-support'

import { fireEvent, screen, waitFor } from '@testing-library/react'

const makeVote = (choice: 'vouch' | 'disavow' | 'neutral') => ({
  __entity_type: 'election_vote' as const,
  entity_id: MOCK_ITEM.id,
  user_id: 'user-1',
  choice,
  created_at: '2026-01-01T00:00:00Z',
})

describe('NewsItemActions voting', () => {
  beforeEach(() => {
    mockSubmitRssFeedItemVote.mockClear()
  })

  it('renders ScoreVote when election data is present', async () => {
    renderNewsItemActions()

    await waitFor(() => {
      expect(screen.getByTestId('news-item-vote')).toBeDefined()
    })
  })

  it('passes correct vote counts to ScoreVote', async () => {
    renderNewsItemActions()

    await waitFor(() => {
      expect(screen.getByTestId('count-up').textContent).toBe('5')
      expect(screen.getByTestId('count-down').textContent).toBe('2')
    })
  })

  it('passes signedOut=false when user is logged in', async () => {
    renderNewsItemActions()

    await waitFor(() => {
      expect(screen.getByTestId('signed-out').textContent).toBe('false')
    })
  })

  it('passes signedOut=true when user is not logged in', async () => {
    mockAuthState.isAuthenticated = false
    renderNewsItemActions()

    await waitFor(() => {
      expect(screen.getByTestId('signed-out').textContent).toBe('true')
    })
    mockAuthState.isAuthenticated = true
  })

  it("threads electionVote.choice='vouch' to ScoreVote's existingVoteChoice", async () => {
    renderNewsItemActions({ electionVote: makeVote('vouch') })

    await waitFor(() => {
      expect(screen.getByTestId('existing-vote-choice').textContent).toBe('vouch')
    })
  })

  it("threads electionVote.choice='disavow' to ScoreVote's existingVoteChoice", async () => {
    renderNewsItemActions({ electionVote: makeVote('disavow') })

    await waitFor(() => {
      expect(screen.getByTestId('existing-vote-choice').textContent).toBe('disavow')
    })
  })

  it('passes existingVoteChoice=undefined when electionVote is null', async () => {
    renderNewsItemActions({ electionVote: null })

    await waitFor(() => {
      expect(screen.getByTestId('existing-vote-choice').textContent).toBe('undefined')
    })
  })

  it("passes entityType='rss_feed_item' to ScoreVote", async () => {
    renderNewsItemActions()

    await waitFor(() => {
      expect(screen.getByTestId('entity-type').textContent).toBe('rss_feed_item')
    })
  })

  it('does not render ScoreVote when the election sidecar is missing', () => {
    renderNewsItemActions({ election: undefined })
    expect(screen.queryByTestId('news-item-vote')).toBeNull()
  })

  it('modal footer uses news-item-modal-vote data-pw (semantic compact control, consistent with row)', async () => {
    renderNewsItemActions({ variant: 'modal-footer' })

    await waitFor(() => {
      // Counts visible in modal — consistent with the row variant.
      expect(screen.getByTestId('news-item-modal-vote')).toBeDefined()
      expect(screen.getByTestId('count-up').textContent).toBe('5')
      expect(screen.getByTestId('count-down').textContent).toBe('2')
      // the semantic control uses its compact default.
    })
  })

  it('submits row votes for the RSS feed item id', async () => {
    renderNewsItemActions()

    fireEvent.click(await screen.findByTestId('news-item-vote-submit'))

    await waitFor(() => {
      expect(mockSubmitRssFeedItemVote).toHaveBeenCalledWith('item-1', 'vouch')
    })
  })

  it('submits modal footer votes for the RSS feed item id', async () => {
    renderNewsItemActions({ variant: 'modal-footer' })

    fireEvent.click(await screen.findByTestId('news-item-modal-vote-submit'))

    await waitFor(() => {
      expect(mockSubmitRssFeedItemVote).toHaveBeenCalledWith('item-1', 'vouch')
    })
  })
})
