import { render } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { describe, expect, it } from 'vitest'
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
})
