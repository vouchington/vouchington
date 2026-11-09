import {
  advanceBoilerplateHostnameCursor,
  readBoilerplateHostnameBatch,
  type BoilerplateHostnameBatch,
} from './hostname-cursor.mts'
import { searchParentPathsNeedingBoilerplateRemoval, type ParentPathCandidate } from './search.mts'

/**
 * Where a run leaves the cursor. A run under the candidate cap covered the whole batch. A capped
 * run covered every hostname before its last candidate's hostname, so the cursor stops just
 * before that hostname and the next run resumes there. A capped run that only reached the first
 * hostname holds the cursor.
 */
function settledBatch(
  batch: BoilerplateHostnameBatch,
  candidates: ParentPathCandidate[],
  candidateLimit: number,
): BoilerplateHostnameBatch | null {
  if (candidates.length < candidateLimit) return batch
  const lastIndex = batch.hostnameIds.indexOf(candidates.at(-1)!.hostname_id)
  if (lastIndex <= 0) return null
  return { ...batch, nextCursor: batch.hostnameIds[lastIndex - 1]! }
}

async function admitThenAdvance(
  batch: BoilerplateHostnameBatch,
  candidates: ParentPathCandidate[],
  options: { candidateLimit: number },
  admit: (candidates: ParentPathCandidate[]) => Promise<void>,
): Promise<void> {
  await admit(candidates)
  const settled = settledBatch(batch, candidates, options.candidateLimit)
  if (settled) await advanceBoilerplateHostnameCursor(settled)
}

/**
 * One scheduled run: aggregate the next hostname batch, admit its candidates, then advance the
 * cursor with compare-and-set. Admission comes first so a failed admission leaves the batch
 * retryable. Admission is idempotent, so a run that loses the race re-admits the same jobs
 * harmlessly.
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
  await admitThenAdvance(batch, candidates, options, admit)
  return candidates
}
