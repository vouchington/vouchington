import {
  ELECTION_VOTE_POLICY_SCORES,
  type ElectionVoteChoice,
  type ElectionVotePolicy,
  type ElectionVoteScore,
} from './types.mts'

type SessionTokenData = {
  did: string
  sid: string
}

const POLICY_CHOICES: Record<ElectionVotePolicy, readonly ElectionVoteChoice[]> = {
  sentiment: ['vouch', 'like', 'neutral', 'dislike', 'disavow'],
  recommendation: ['support', 'oppose'],
  relation: ['confirm', 'dispute'],
  moderation: ['accurate', 'inaccurate'],
}

export const POLICY_SCORES: Record<
  ElectionVotePolicy,
  Record<string, ElectionVoteScore>
> = ELECTION_VOTE_POLICY_SCORES

export function isElectionVoteChoice(
  policy: ElectionVotePolicy,
  choice: unknown,
): choice is ElectionVoteChoice {
  return typeof choice === 'string' && POLICY_CHOICES[policy].includes(choice as ElectionVoteChoice)
}

export function getElectionVoteChoiceScore(
  policy: ElectionVotePolicy,
  choice: ElectionVoteChoice,
): ElectionVoteScore {
  return POLICY_SCORES[policy][choice]!
}

export function toElectionVoteChoice(
  policy: ElectionVotePolicy,
  score: ElectionVoteScore,
  scoreIsSemantic = false,
): ElectionVoteChoice | null {
  if (score === null) return null
  if (policy === 'sentiment' && score === 1 && !scoreIsSemantic) return 'vouch'
  if (policy === 'sentiment' && score === -1 && !scoreIsSemantic) return 'disavow'
  return POLICY_CHOICES[policy].find(choice => POLICY_SCORES[policy][choice] === score) ?? null
}

export function getElectionVoteRateLimitKeys(
  currentUserId: string,
  ip: string | undefined,
  sessionData: SessionTokenData | null,
): string[] {
  const rateLimitKeys = [`uid:${currentUserId}`]

  if (ip) {
    rateLimitKeys.push(`ip:${ip}`)
  }

  if (!sessionData) return rateLimitKeys

  rateLimitKeys.push(`did:${sessionData.did}`)
  rateLimitKeys.push(`sid:${sessionData.sid}`)
  return rateLimitKeys
}
