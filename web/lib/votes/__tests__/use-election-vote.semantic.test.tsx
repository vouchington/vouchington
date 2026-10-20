import { render } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '@/lib/auth/auth-provider'
import type { ClientAuthUser } from '@/lib/auth/client-auth-user'
import { useElectionVote } from '../use-election-vote'
import { VoteStoreProvider } from '../vote-store-provider'
import type { VoteEntityType } from '../store'

type Observation = {
  electionId: string
  currentVote: string | null
  countUp: number
  countDown: number
}

type VoteProbeProps = {
  electionId: string
  entityType?: VoteEntityType
  initialVote: 'like' | 'disavow' | null
  initialCountUp: number
  initialCountDown: number
  onObserve: (observation: Observation) => void
}

function VoteProbe({
  electionId,
  entityType = 'post',
  initialVote,
  initialCountUp,
  initialCountDown,
  onObserve,
}: VoteProbeProps) {
  const vote = useElectionVote(entityType, electionId, {
    initialVote,
    initialCountUp,
    initialCountDown,
    submitVote: async () => {},
    clearVote: async () => {},
  })
  useLayoutEffect(() => {
    onObserve({
      electionId,
      currentVote: vote.currentVote,
      countUp: vote.countUp,
      countDown: vote.countDown,
    })
  }, [electionId, vote.currentVote, vote.countUp, vote.countDown, onObserve])
  return null
}

function secondElectionProps(onObserve: (observation: Observation) => void): VoteProbeProps {
  return {
    electionId: 'election-2',
    initialVote: 'disavow',
    initialCountUp: 3,
    initialCountDown: 8,
    onObserve,
  }
}

describe('useElectionVote identity state', () => {
  it('does not expose a prior providerless fallback entry while changing election identity', () => {
    const observations: Observation[] = []
    const rendered = render(
      <VoteProbe
        electionId='election-1'
        initialVote='like'
        initialCountUp={5}
        initialCountDown={2}
        onObserve={observation => observations.push(observation)}
      />,
    )

    rendered.rerender(
      <VoteProbe {...secondElectionProps(observation => observations.push(observation))} />,
    )

    expect(observations.filter(({ electionId }) => electionId === 'election-2')).toEqual([
      {
        electionId: 'election-2',
        currentVote: 'disavow',
        countUp: 3,
        countDown: 8,
      },
    ])
  })

  it('hydrates a newly mounted provider identity without exposing the prior local entry', () => {
    const observations: Observation[] = []
    const onObserve = (observation: Observation) => observations.push(observation)
    const rendered = render(
      <VoteStoreProvider>
        <VoteProbe
          electionId='election-1'
          initialVote='like'
          initialCountUp={5}
          initialCountDown={2}
          onObserve={onObserve}
        />
      </VoteStoreProvider>,
    )

    rendered.rerender(
      <VoteStoreProvider>
        <VoteProbe {...secondElectionProps(onObserve)} />
      </VoteStoreProvider>,
    )

    expect(observations.filter(({ electionId }) => electionId === 'election-2')).toEqual([
      {
        electionId: 'election-2',
        currentVote: 'disavow',
        countUp: 3,
        countDown: 8,
      },
    ])
  })

  it.each([
    { nextUserId: 'user-b', label: 'another account' },
    { nextUserId: null, label: 'signed out' },
  ])('shows the current viewer vote when the signed-in user becomes $label', ({ nextUserId }) => {
    const observations: Observation[] = []
    const onObserve = (observation: Observation) => observations.push(observation)
    function viewer(
      userId: string | null,
      initialVote: 'like' | 'disavow' | null,
      countUp: number,
    ) {
      const initialUser: ClientAuthUser | null = userId
        ? { id: userId, roles: ['user'], account_type: 'official' }
        : null
      return (
        <AuthProvider initialUser={initialUser}>
          <VoteStoreProvider>
            <VoteProbe
              electionId='election-1'
              initialVote={initialVote}
              initialCountUp={countUp}
              initialCountDown={0}
              onObserve={onObserve}
            />
          </VoteStoreProvider>
        </AuthProvider>
      )
    }

    const rendered = render(viewer('user-a', 'like', 5))
    const beforeSwitch = observations.length
    rendered.rerender(viewer(nextUserId, null, 1))

    expect(observations.slice(beforeSwitch)).toEqual([
      {
        electionId: 'election-1',
        currentVote: null,
        countUp: 1,
        countDown: 0,
      },
    ])

    rendered.rerender(viewer('user-a', 'disavow', 2))
    expect(observations.at(-1)).toEqual({
      electionId: 'election-1',
      currentVote: 'disavow',
      countUp: 2,
      countDown: 0,
    })
  })
})
