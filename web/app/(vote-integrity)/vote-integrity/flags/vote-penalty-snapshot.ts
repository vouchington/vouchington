import { getVoteIntegrityPenaltiesClient } from '@/lib/api/client/vote-integrity'
import type { VoteIntegrityPenaltiesResponse } from '@/types/vote-integrity'

export async function getExactVotePenaltyIds(flagId: string): Promise<ReadonlySet<string>> {
  return collectExactVotePenaltyIds(flagId, undefined, new Set(), new Set())
}

async function collectExactVotePenaltyIds(
  flagId: string,
  after: string | undefined,
  penaltyIds: Set<string>,
  seenCursors: Set<string>,
): Promise<ReadonlySet<string>> {
  const page = await getVoteIntegrityPenaltiesClient<VoteIntegrityPenaltiesResponse>({
    sourceFlagId: flagId,
    after,
  })
  if (page.filter_scope?.source !== 'flag' || page.filter_scope.source_flag_id !== flagId) {
    throw new Error('Vote penalty snapshot returned an unexpected filter scope')
  }
  for (const penalty of page.results) penaltyIds.add(penalty.id)
  if (!page.page_info.has_next_page) return penaltyIds

  const nextCursor = page.page_info.end_cursor
  if (!nextCursor || seenCursors.has(nextCursor)) {
    throw new Error('Vote penalty snapshot returned an invalid continuation cursor')
  }
  seenCursors.add(nextCursor)
  return collectExactVotePenaltyIds(flagId, nextCursor, penaltyIds, seenCursors)
}
