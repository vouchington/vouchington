import {
  advanceBoilerplateHostnameCursor,
  readBoilerplateHostnameBatch,
} from './hostname-cursor.mts'
import { searchParentPathsNeedingBoilerplateRemoval, type ParentPathCandidate } from './search.mts'

/**
 * One scheduled run: aggregate the next hostname batch, then advance the cursor with
 * compare-and-set. A run that lost the race returns nothing; the winner covered the same batch.
 */
export async function sweepNextBoilerplateHostnameBatch(options: {
  hostnameBatchSize: number
  candidateLimit: number
}): Promise<ParentPathCandidate[]> {
  const batch = await readBoilerplateHostnameBatch(options.hostnameBatchSize)
  const candidates = await searchParentPathsNeedingBoilerplateRemoval(
    batch.hostnameIds,
    options.candidateLimit,
  )
  return (await advanceBoilerplateHostnameCursor(batch)) ? candidates : []
}
