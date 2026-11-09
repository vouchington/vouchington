import {
  advanceBoilerplateHostnameCursor,
  readBoilerplateHostnameBatch,
} from './hostname-cursor.mts'
import { searchParentPathsNeedingBoilerplateRemoval, type ParentPathCandidate } from './search.mts'

/**
 * One scheduled run: aggregate the next hostname batch, admit its candidates, then advance the
 * cursor with compare-and-set. Admission comes first so a failed admission leaves the batch
 * retryable, and a run that hit the candidate cap stays on the batch because the overflow is
 * rediscovered once the admitted paths have fresh removals. Admission is idempotent, so a run
 * that loses the race re-admits the same jobs harmlessly.
 */
export async function sweepNextBoilerplateHostnameBatch(
  options: { hostnameBatchSize: number; candidateLimit: number },
  admit: (candidates: ParentPathCandidate[]) => Promise<void>,
): Promise<ParentPathCandidate[]> {
  const batch = await readBoilerplateHostnameBatch(options.hostnameBatchSize)
  const candidates = await searchParentPathsNeedingBoilerplateRemoval(
    batch.hostnameIds,
    options.candidateLimit,
  )
  await admit(candidates)
  if (candidates.length < options.candidateLimit) await advanceBoilerplateHostnameCursor(batch)
  return candidates
}
