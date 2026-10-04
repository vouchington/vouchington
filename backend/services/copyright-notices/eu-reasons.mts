import type { PrivateUser } from '@services/users/types'
import {
  recordTerritorialCopyrightDecision,
  type TerritorialCopyrightDecisionInput,
} from './territorial-decision.mts'
import { enforceCopyrightAssessment } from './enforce-assessment.mts'

export type EuCopyrightStatementOfReasons = {
  id: string
  decided_at: Date
  automation_disclosure: 'human'
}

/** The EU decision is the DSA Art. 17 statement of reasons. */
export async function recordEuCopyrightStatementOfReasons(
  actor: PrivateUser,
  noticeId: string,
  input: TerritorialCopyrightDecisionInput,
  dependencies: { enforceAssessment?: typeof enforceCopyrightAssessment } = {},
): Promise<EuCopyrightStatementOfReasons> {
  return recordTerritorialCopyrightDecision(actor, 'eu_dsa', noticeId, input, dependencies)
}
