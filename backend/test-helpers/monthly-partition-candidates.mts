import { write, type QueryExecutor } from '@data-stores/psql'
import {
  listMonthlyDropCandidates,
  type PartitionCleanupCursor,
} from '@data-stores/psql/migration-runner/monthly-partition-candidates'
import type { PartitionDropCandidate } from '@data-stores/psql/migration-runner/partition-drop-guard'

/** Read a bounded bootstrap catalog for assertions that span more than one maintenance page. */
export async function listTestMonthlyDropCandidates(
  query: QueryExecutor = write,
): Promise<PartitionDropCandidate[]> {
  const candidates: PartitionDropCandidate[] = []
  let after: PartitionCleanupCursor | undefined
  for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
    const page = await listMonthlyDropCandidates(query, 50, after)
    candidates.push(...page.candidates)
    if (!page.hasMore) return candidates
    after = page.nextCursor
    if (!after) throw new Error('Monthly catalog page has no continuation cursor')
  }
  throw new Error('Monthly test catalog exceeded ten pages')
}
