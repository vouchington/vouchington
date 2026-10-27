import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierCandidateKind } from '@voucha/types'
import {
  readCompleteClassifierDecision,
  readCompleteClassifierDecisionForActiveReservation,
} from './read-complete-decision.mts'
import { isClassifierBatchWithinRetention } from './retention-window.mts'

export function readPersistedClassifierDecision(
  query: OwnedTransaction,
  batchId: string,
  candidateKind: ClassifierCandidateKind,
  activeRunId?: string,
) {
  if (isClassifierBatchWithinRetention(batchId)) {
    return readCompleteClassifierDecision(query, batchId, candidateKind)
  }
  if (!activeRunId)
    throw new RangeError('Classifier decision batch is outside the retention window')
  return readCompleteClassifierDecisionForActiveReservation(
    query,
    activeRunId,
    batchId,
    candidateKind,
  )
}
