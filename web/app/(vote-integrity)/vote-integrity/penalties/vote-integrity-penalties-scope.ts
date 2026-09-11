import type { VoteIntegrityPenaltiesResponse } from '@/types/vote-integrity'

export function hasConfirmedFlagScope(page: VoteIntegrityPenaltiesResponse): boolean {
  return page.filter_scope?.source === 'flag' && page.filter_scope.source_flag_id === null
}
