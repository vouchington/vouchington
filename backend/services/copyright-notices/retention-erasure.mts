import { randomUUID } from 'node:crypto'
import { read } from '@data-stores/psql'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import sql from 'sql-template-strings'
import {
  getCopyrightEvidenceRetentionDays,
  isCopyrightEvidenceRetentionDeletionEnabled,
} from './config.mts'
import { eraseCopyrightRetentionCase } from './retention-erasure-case.mts'
import { copyrightRetentionEligibleSql } from './retention-erasure-eligibility.mts'

/** Cases erased per run; the rest wait for the next scheduled run. */
export const COPYRIGHT_RETENTION_ERASURE_LIMIT = 25

const DAY_MS = 24 * 60 * 60 * 1000

export type CopyrightRetentionSweepResult = {
  erased: number
  /** Cases that stopped being eligible between selection and the locked recheck. */
  ineligible: number
  /** Cases left for the next run; reasons are error class names only, never messages or keys. */
  failed: { noticeId: string; reason: string }[]
}

const nothingDeleted = (): CopyrightRetentionSweepResult => ({
  erased: 0,
  ineligible: 0,
  failed: [],
})

/** A failure's class name and short code, safe to report: messages can carry keys or ARNs. */
function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError'
  const code = (error as Error & { code?: unknown }).code
  return typeof code === 'string' && /^[\w.-]{1,64}$/.test(code)
    ? `${error.name}:${code}`
    : error.name
}

/** Up to `limit` eligible notice ids in a different random order each run, so no case starves. */
async function selectCandidates(options: {
  now: Date
  cutoff: Date
  limit: number
  noticeIds?: readonly string[]
}): Promise<string[]> {
  observeSharedDbScope(
    'selectCopyrightRetentionErasureCandidates',
    sharedDbIdsScope(options.noticeIds),
  )
  const scope = options.noticeIds ? [...options.noticeIds] : null
  const { rows } = await read<{ id: string }>(
    sql`/* selectCopyrightRetentionErasureCandidates */`
      .append(copyrightRetentionEligibleSql(options.now, options.cutoff))
      .append(
        sql`SELECT id FROM eligible
          WHERE (${scope}::uuid[] IS NULL OR id = ANY(${scope}::uuid[]))
          ORDER BY md5(id::text || ${randomUUID()}) LIMIT ${options.limit}`,
      ),
  )
  return rows.map(row => row.id)
}

/**
 * Erases the evidence and personal data of US DMCA cases whose retention period has run out, at
 * most `limit` per run, keeping the minimal record the §512(i) repeat-infringer counts need. It
 * does nothing, and reads nothing else, while `copyright.evidenceRetentionDeletion` is off or
 * `copyright.evidenceRetentionDays` is unset. A case that fails (a bucket refusal, a lock timeout)
 * is left exactly as it was and returned in `failed` for the next run; the others still run.
 * `noticeIds` bounds a test to its own fixtures.
 */
export async function sweepCopyrightEvidenceRetention(
  options: { now?: Date; limit?: number; noticeIds?: readonly string[] } = {},
): Promise<CopyrightRetentionSweepResult> {
  if (!(await isCopyrightEvidenceRetentionDeletionEnabled())) return nothingDeleted()
  const retentionDays = await getCopyrightEvidenceRetentionDays()
  if (retentionDays === null) return nothingDeleted()
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS)
  const candidates = await selectCandidates({
    now,
    cutoff,
    limit: options.limit ?? COPYRIGHT_RETENTION_ERASURE_LIMIT,
    noticeIds: options.noticeIds,
  })
  const result = nothingDeleted()
  for (const noticeId of candidates) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time keeps bucket and lock load flat.
      const outcome = await eraseCopyrightRetentionCase(noticeId, { now, cutoff, retentionDays })
      if (outcome === 'erased') result.erased += 1
      else result.ineligible += 1
    } catch (err) {
      result.failed.push({ noticeId, reason: failureReason(err) })
    }
  }
  return result
}
