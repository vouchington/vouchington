import type { ElectionVote } from '@voucha/types/entities/election'
export { indexById } from '@vouchington/utils/collections'

export function electionVotesMapToRecord(
  votes: Map<string, ElectionVote>,
): Record<string, ElectionVote> {
  return Object.fromEntries(votes.entries())
}
