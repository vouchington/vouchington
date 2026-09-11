import { encodeScopedUuidCursor } from '@modules/pagination'

export const adminId = '019f7000-0000-7000-8000-000000000001'
export const userId = '019f7000-0000-7000-8000-000000000002'
const reportFlagId = '019f7000-0000-7000-8000-000000000010'
const voteFlagId = '019f7000-0000-7000-8000-000000000020'
export const reportPenaltyId = '019f7000-0000-7000-8000-000000000101'
export const reportSecondPenaltyId = '019f7000-0000-7000-8000-000000000102'
export const votePenaltyId = '019f7000-0000-7000-8000-000000000201'
export const voteSecondPenaltyId = '019f7000-0000-7000-8000-000000000202'
export const voteRetainedPenaltyId = '019f7000-0000-7000-8000-000000000203'
const createdAt = '2026-06-01T12:00:00.000Z'
export const revokedAt = '2026-06-02T12:00:00.000Z'

export const reportActivePenalty = {
  id: reportPenaltyId,
  user_id: userId,
  reason: 'mass_report_campaign',
  source_flag_id: reportFlagId,
  created_by_id: adminId,
  revoked_at: null,
  revoked_by_id: null,
  created_at: createdAt,
  updated_at: createdAt,
}
export const reportRevokedPenalty = {
  ...reportActivePenalty,
  id: reportSecondPenaltyId,
  created_by_id: null,
  revoked_at: revokedAt,
  revoked_by_id: adminId,
  updated_at: revokedAt,
}
export const voteActivePenalty = {
  id: votePenaltyId,
  user_id: userId,
  penalty_multiplier: 0.2,
  reason: 'voting_ring',
  source_flag_id: voteFlagId,
  created_by_id: adminId,
  revoked_at: null,
  revoked_by_id: null,
  created_at: createdAt,
}
export const voteRevokedPenalty = {
  ...voteActivePenalty,
  id: voteSecondPenaltyId,
  revoked_at: revokedAt,
  revoked_by_id: adminId,
}
export const voteRetainedPenalty = {
  ...voteActivePenalty,
  id: voteRetainedPenaltyId,
  source_flag_id: null,
}

export function penaltyCursor(
  resource: 'report-abuse-penalties' | 'vote-weight-penalties',
  status: 'active' | 'revoked' | 'all',
  id: string,
): string {
  return encodeScopedUuidCursor(
    id,
    JSON.stringify({
      resource,
      status,
      ...(resource === 'vote-weight-penalties' ? { source: 'flag' } : {}),
      user_id: null,
      source_flag_id: null,
      order: 'id-desc',
    }),
  )
}

export function terminalPage(startCursor: string) {
  return { has_next_page: false, start_cursor: startCursor, end_cursor: null }
}
