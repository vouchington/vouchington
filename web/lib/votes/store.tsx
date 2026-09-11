'use client'

import { createContext } from 'react'
import type { ElectionVoteChoice } from '@/lib/api/client/elections'

export type VoteEntityType =
  | 'post'
  | 'comment'
  | 'rss_feed_item'
  | 'topic'
  | 'hostname'
  | 'agent_moderation'
  | 'entity_relation'
export type VoteChoice = ElectionVoteChoice | null
export interface VoteEntry {
  currentVote: VoteChoice
  countUp: number
  countDown: number
}
export type Listener = () => void
export interface VoteStore {
  hydrate: (entityType: VoteEntityType, electionId: string, entry: VoteEntry) => void
  getEntry: (entityType: VoteEntityType, electionId: string) => VoteEntry | undefined
  applyOptimistic: (
    entityType: VoteEntityType,
    electionId: string,
    nextVote: VoteChoice,
  ) => () => void
  subscribe: (entityType: VoteEntityType, electionId: string, listener: Listener) => () => void
}
export const VoteStoreContext = createContext<VoteStore | null>(null)
export const makeVoteKey = (entityType: VoteEntityType, electionId: string) =>
  `${entityType}:${electionId}`

const VOTE_SIGN_BY_CHOICE = {
  accurate: 1,
  confirm: 1,
  disavow: -1,
  dislike: -1,
  dispute: -1,
  inaccurate: -1,
  like: 1,
  neutral: 0,
  oppose: -1,
  support: 1,
  vouch: 1,
} as const satisfies Record<ElectionVoteChoice, -1 | 0 | 1>

export function voteSign(choice: VoteChoice): -1 | 0 | 1 {
  return choice === null ? 0 : VOTE_SIGN_BY_CHOICE[choice]
}
export function nextEntryFor(prev: VoteEntry, nextVote: VoteChoice): VoteEntry {
  const previousSign = voteSign(prev.currentVote)
  const nextSign = voteSign(nextVote)
  return {
    currentVote: nextVote,
    countUp: Math.max(0, prev.countUp - (previousSign === 1 ? 1 : 0) + (nextSign === 1 ? 1 : 0)),
    countDown: Math.max(
      0,
      prev.countDown - (previousSign === -1 ? 1 : 0) + (nextSign === -1 ? 1 : 0),
    ),
  }
}
