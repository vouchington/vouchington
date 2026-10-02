import type { PrivateUser } from '@services/users/types'
import { recordTerritorialCopyrightDecision } from './territorial-decision.mts'

export type EuCopyrightStatementOfReasons = {
  id: string
  decided_at: Date
  automation_disclosure: 'human'
}

/** The EU decision is the DSA Art. 17 statement of reasons. */
export async function recordEuCopyrightStatementOfReasons(
  actor: PrivateUser,
  noticeId: string,
  statement: string,
): Promise<EuCopyrightStatementOfReasons> {
  return recordTerritorialCopyrightDecision(actor, 'eu_dsa', noticeId, statement)
}
