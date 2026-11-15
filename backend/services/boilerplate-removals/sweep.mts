import {
  advanceBoilerplateHostnameCursor,
  readBoilerplateHostnameBatch,
  type BoilerplateHostnameBatch,
} from './hostname-cursor.mts'
import {
  searchParentPathsNeedingBoilerplateRemoval,
  type ParentPathCandidate,
  type BoilerplatePathCursor,
} from './search.mts'

export type BoilerplateSweepContinuation = BoilerplateHostnameBatch & {
  after?: BoilerplatePathCursor
}

/** Admission and continuation are durable before the hostname cursor advances. */
export async function sweepNextBoilerplateHostnameBatch(
  options: { hostnameBatchSize: number; candidateLimit: number },
  admit: (candidates: ParentPathCandidate[]) => Promise<void>,
  continueSweep: (continuation: BoilerplateSweepContinuation) => Promise<void>,
  continuation?: BoilerplateSweepContinuation,
): Promise<ParentPathCandidate[]> {
  const batch: BoilerplateSweepContinuation =
    continuation ?? (await readBoilerplateHostnameBatch(options.hostnameBatchSize))
  // Each job walks one hostname's URL index. Even an empty candidate page can need continuation.
  const hostnameId = batch.hostnameIds[0]
  if (!hostnameId) {
    await advanceBoilerplateHostnameCursor(batch)
    return []
  }
  const page = await searchParentPathsNeedingBoilerplateRemoval(
    [hostnameId],
    options.candidateLimit,
    { after: batch.after },
  )
  await admit(page.candidates)
  if (page.after) await continueSweep({ ...batch, after: page.after })
  else if (batch.hostnameIds.length > 1) {
    await continueSweep({ ...batch, hostnameIds: batch.hostnameIds.slice(1), after: undefined })
  } else await advanceBoilerplateHostnameCursor(batch)
  return page.candidates
}
