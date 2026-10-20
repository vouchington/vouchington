import { act, fireEvent, render, screen } from '@testing-library/react'
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

function holdRequest(): { promise: Promise<void>; settle: () => void } {
  let settle: () => void = () => {}
  const promise = new Promise<void>(resolve => {
    settle = resolve
  })
  return { promise, settle }
}

function PendingVoteControls({
  submitVote,
  clearVote,
}: {
  submitVote: (choice: 'like' | 'disavow') => Promise<void>
  clearVote: () => Promise<void>
}) {
  const vote = useElectionVote('post', 'election-1', {
    initialVote: null,
    initialCountUp: 0,
    initialCountDown: 0,
    submitVote,
    clearVote,
  })
  return (
    <>
      <button
        type='button'
        disabled={vote.isLoading}
        onClick={() => void vote.handleVote('like')}
      >
        like
      </button>
      <button
        type='button'
        disabled={vote.isLoading}
        onClick={() => void vote.handleVote('disavow')}
      >
        disavow
      </button>
      <output>{vote.isLoading ? 'loading' : 'ready'}</output>
    </>
  )
}

function pendingViewer(
  userId: string,
  submitVote: (choice: 'like' | 'disavow') => Promise<void>,
  clearVote: () => Promise<void>,
) {
  const initialUser: ClientAuthUser = {
    id: userId,
    roles: ['user'],
    account_type: 'official',
  }
  return (
    <AuthProvider initialUser={initialUser}>
      <VoteStoreProvider>
        <PendingVoteControls
          submitVote={submitVote}
          clearVote={clearVote}
        />
      </VoteStoreProvider>
    </AuthProvider>
  )
}

describe('useElectionVote in-flight requests', () => {
  it('keeps each account pending until that account request settles', async () => {
    const calls: string[] = []
    const accountA = holdRequest()
    const accountB = holdRequest()
    const gates = new Map<string, Promise<void>>([
      ['user-a', accountA.promise],
      ['user-b', accountB.promise],
    ])
    const submitVoteFor = (userId: string) => async (choice: 'like' | 'disavow') => {
      calls.push(`${userId}:${choice}`)
      const gate = gates.get(userId)
      if (!gate) throw new Error(`missing gate ${userId}`)
      await gate
    }
    const clearVote = async () => {
      calls.push('clear')
    }

    const rendered = render(pendingViewer('user-a', submitVoteFor('user-a'), clearVote))
    fireEvent.click(screen.getByRole('button', { name: 'like' }))
    expect(screen.getByRole('status')).toHaveTextContent('loading')
    expect(screen.getByRole('button', { name: 'like' })).toBeDisabled()
    expect(calls).toEqual(['user-a:like'])

    rendered.rerender(pendingViewer('user-b', submitVoteFor('user-b'), clearVote))
    expect(screen.getByRole('status')).toHaveTextContent('ready')
    fireEvent.click(screen.getByRole('button', { name: 'disavow' }))
    expect(screen.getByRole('status')).toHaveTextContent('loading')
    expect(calls).toEqual(['user-a:like', 'user-b:disavow'])

    rendered.rerender(pendingViewer('user-a', submitVoteFor('user-a'), clearVote))
    expect(screen.getByRole('status')).toHaveTextContent('loading')
    expect(screen.getByRole('button', { name: 'disavow' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'disavow' }))
    expect(calls).toEqual(['user-a:like', 'user-b:disavow'])

    await act(async () => {
      accountB.settle()
    })
    expect(screen.getByRole('status')).toHaveTextContent('loading')
    expect(calls).toEqual(['user-a:like', 'user-b:disavow'])

    await act(async () => {
      accountA.settle()
    })
    expect(screen.getByRole('status')).toHaveTextContent('ready')

    rendered.rerender(pendingViewer('user-b', submitVoteFor('user-b'), clearVote))
    expect(screen.getByRole('status')).toHaveTextContent('ready')
    fireEvent.click(screen.getByRole('button', { name: 'like' }))
    expect(calls).toEqual(['user-a:like', 'user-b:disavow', 'user-b:like'])
  })
})
