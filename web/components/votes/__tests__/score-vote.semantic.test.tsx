import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScoreVote } from '../score-vote'
import { VoteStoreProvider } from '@/lib/votes/vote-store-provider'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import type { SentimentChoice } from '@/lib/api/client/elections'

const clearVote = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
const getByPw = (value: string) => {
  const element = document.querySelector(`[data-pw="${value}"]`)
  if (!element) throw new Error(`Missing data-pw=${value}`)
  return element as HTMLElement
}
const getVoteRoot = (value: string) => {
  const root = document.querySelector(`[data-vote-root="${value}"]`)
  if (!root) throw new Error(`Missing ${value} vote root`)
  return root as HTMLElement
}
const getVoteChoice = (root: string, choice: string) => {
  const element = document.querySelector(
    `[data-vote-control="${root}"] [data-vote-choice="${choice}"], [data-vote-root="${root}"] [data-vote-choice="${choice}"]`,
  )
  if (!element) throw new Error(`Missing ${root} ${choice} choice`)
  return element as HTMLElement
}
const getVoteClear = (root: string) => {
  const element = document.querySelector(`[data-vote-clear-for="${root}"]`)
  if (!element) throw new Error(`Missing ${root} clear control`)
  return element as HTMLElement
}

function renderSentiment(overrides: Record<string, unknown> = {}) {
  return render(
    <ScoreVote
      electionId='election-1'
      entityType='post'
      countUp={5}
      countDown={2}
      existingVoteChoice='like'
      submitVote={vi
        .fn<
          (
            id: string,
            choice: import('@/lib/api/client/elections').SentimentChoice,
          ) => Promise<void>
        >()
        .mockResolvedValue(undefined)}
      clearVote={clearVote}
      data-pw='vote'
      {...(overrides as object)}
    />,
  )
}

describe('ScoreVote semantic control', () => {
  it('renders a labelled compact popover with Neutral after an existing ballot', () => {
    renderSentiment()
    fireEvent.click(getVoteRoot('vote').querySelector('[data-pw="semantic-vote-trigger"]')!)
    for (const choice of ['vouch', 'like', 'neutral', 'dislike', 'disavow']) {
      expect(getVoteChoice('vote', choice)).toBeInTheDocument()
    }
    expect(document.querySelector('[data-vote-clear-for="vote"]')).toBeNull()
  })

  it('hides Neutral until the viewer already has a ballot', () => {
    renderSentiment({ existingVoteChoice: undefined })
    fireEvent.click(getVoteRoot('vote').querySelector('[data-pw="semantic-vote-trigger"]')!)
    expect(
      document.querySelector('[data-vote-control="vote"] [data-vote-choice="neutral"]'),
    ).toBeNull()
    expect(getVoteChoice('vote', 'like')).toBeInTheDocument()
  })

  it('uses a labelled radio group on spacious sentiment surfaces', () => {
    renderSentiment({ presentation: 'group' })
    expect(screen.getByRole('radiogroup', { name: 'Vote' })).toBeInTheDocument()
    expect(getVoteChoice('vote', 'vouch')).toHaveAttribute('role', 'radio')
  })

  it('keeps binary policies compact and sends only their semantic choice', async () => {
    const submitVote = vi
      .fn<
        (
          id: string,
          choice: import('@/lib/api/client/elections').RecommendationChoice,
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined)
    renderSentiment({ policy: 'recommendation', existingVoteChoice: 'support', submitVote })
    fireEvent.click(getVoteChoice('vote', 'oppose'))
    await waitFor(() => expect(submitVote).toHaveBeenCalledWith('election-1', 'oppose'))
    expect(getVoteRoot('vote').querySelector('[data-pw="semantic-vote-trigger"]')).toBeNull()
  })

  it('retracts a public ballot by sending Neutral', async () => {
    const submitVote = vi
      .fn<(id: string, choice: SentimentChoice) => Promise<void>>()
      .mockResolvedValue(undefined)
    renderSentiment({ submitVote })
    fireEvent.click(getVoteRoot('vote').querySelector('[data-pw="semantic-vote-trigger"]')!)
    fireEvent.click(getVoteChoice('vote', 'neutral'))
    await waitFor(() => expect(submitVote).toHaveBeenCalledWith('election-1', 'neutral'))
    expect(clearVote).not.toHaveBeenCalled()
  })

  it('disables an official account clear action when the vote surface is closed', () => {
    render(
      <AuthProvider initialUser={{ id: 'agent-1', roles: ['user'], isOfficialAccount: true }}>
        <ScoreVote
          electionId='election-1'
          entityType='post'
          countUp={5}
          countDown={2}
          existingVoteChoice='like'
          submitVote={vi
            .fn<
              (
                id: string,
                choice: import('@/lib/api/client/elections').SentimentChoice,
              ) => Promise<void>
            >()
            .mockResolvedValue(undefined)}
          clearVote={clearVote}
          data-pw='official-vote'
          disabled
        />
      </AuthProvider>,
    )

    expect(
      getVoteRoot('official-vote').querySelector('[data-pw="semantic-vote-trigger"]'),
    ).toBeNull()
    expect(getVoteClear('official-vote')).toBeDisabled()
  })

  it('lets an official who can also cast Clear an existing ballot', async () => {
    render(
      <AuthProvider
        initialUser={{ id: 'admin-1', roles: ['administrator'], isOfficialAccount: true }}
      >
        <ScoreVote
          electionId='election-1'
          entityType='post'
          countUp={5}
          countDown={2}
          existingVoteChoice='like'
          allowOfficialAccounts
          submitVote={vi
            .fn<
              (
                id: string,
                choice: import('@/lib/api/client/elections').SentimentChoice,
              ) => Promise<void>
            >()
            .mockResolvedValue(undefined)}
          clearVote={clearVote}
          data-pw='official-cast-vote'
        />
      </AuthProvider>,
    )

    fireEvent.click(getVoteClear('official-cast-vote'))
    await waitFor(() => expect(clearVote).toHaveBeenCalledWith('election-1'))
  })

  it('rolls back a failed semantic mutation', async () => {
    const submitVote = vi
      .fn<
        (id: string, choice: import('@/lib/api/client/elections').SentimentChoice) => Promise<void>
      >()
      .mockRejectedValue(new Error('failed'))
    renderSentiment({ submitVote })
    fireEvent.click(getVoteRoot('vote').querySelector('[data-pw="semantic-vote-trigger"]')!)
    fireEvent.click(getVoteChoice('vote', 'disavow'))
    await waitFor(() =>
      expect(
        getVoteRoot('vote').querySelector('[data-pw="semantic-vote-trigger"]'),
      ).toHaveTextContent('Like'),
    )
  })

  it('uses a login link for signed-out intent', () => {
    renderSentiment({ signedOut: true })
    expect(getByPw('vote-sign-in')).toHaveAttribute('href', expect.stringContaining('/login'))
  })

  it('formats both vote counts with the resolved UI locale', () => {
    render(
      <UiLocaleProvider uiLocale='de-DE'>
        <ScoreVote
          electionId='election-1'
          entityType='post'
          countUp={1234}
          countDown={5678}
          submitVote={vi
            .fn<(id: string, choice: SentimentChoice) => Promise<void>>()
            .mockResolvedValue(undefined)}
          clearVote={clearVote}
          data-pw='localized-vote'
        />
      </UiLocaleProvider>,
    )

    expect(getVoteRoot('localized-vote')).toHaveTextContent('+1.234 −5.678')
  })

  it('synchronizes optimistic choices across shared controls', async () => {
    const submitVote = vi
      .fn<
        (id: string, choice: import('@/lib/api/client/elections').SentimentChoice) => Promise<void>
      >()
      .mockResolvedValue(undefined)
    render(
      <VoteStoreProvider>
        <ScoreVote
          electionId='election-1'
          entityType='post'
          countUp={5}
          countDown={2}
          submitVote={submitVote}
          clearVote={clearVote}
          data-pw='card'
        />
        <ScoreVote
          electionId='election-1'
          entityType='post'
          countUp={5}
          countDown={2}
          submitVote={submitVote}
          clearVote={clearVote}
          data-pw='detail'
        />
      </VoteStoreProvider>,
    )
    fireEvent.click(getVoteRoot('card').querySelector('[data-pw="semantic-vote-trigger"]')!)
    fireEvent.click(getVoteChoice('card', 'vouch'))
    await waitFor(() =>
      expect(
        getVoteRoot('detail').querySelector('[data-pw="semantic-vote-trigger"]'),
      ).toHaveTextContent('Vouch'),
    )
  })
})
