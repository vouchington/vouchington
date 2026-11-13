import {
  readCopyrightThreadRetirement,
  readCopyrightCasePreservationCoverage,
} from '@data-stores/psql/copyright-preservation-coverage'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../services/copyright-notices/compliance-assessment.mts'
import type pg from 'pg'
import { beginTransaction, writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

/** Finish the real retirement transaction after a hold has read its protected records. */
export function afterCopyrightHoldCoverage<Result>(
  noticeId: string,
  retire: () => Promise<unknown>,
  placeHold: () => Promise<Result>,
) {
  return afterCopyrightPreservationRead(noticeId, retire, placeHold, 'hold')
}

/** Finish a real retirement after the evidence writer has read the case marker. */
export function afterCopyrightThreadRetirementRead<Result>(
  noticeId: string,
  retire: () => Promise<unknown>,
  writeEvidence: () => Promise<Result>,
) {
  return afterCopyrightPreservationRead(noticeId, retire, writeEvidence, 'marker')
}

/** Finish the real retirement transaction after a hold has read its protected records. */
async function afterCopyrightPreservationRead<Result>(
  noticeId: string,
  retire: () => Promise<unknown>,
  placeHold: () => Promise<Result>,
  kind: 'hold' | 'marker',
): Promise<Result> {
  return runPoolObservationExclusively(async () => {
    let retired = false
    const restorations = new Map<pg.PoolClient, () => void>()
    const observe = (client: pg.PoolClient) => {
      if (restorations.has(client)) return
      const descriptor = Object.getOwnPropertyDescriptor(client, 'query')
      const original = client.query
      restorations.set(client, () => {
        if (descriptor) Object.defineProperty(client, 'query', descriptor)
        else Reflect.deleteProperty(client, 'query')
      })
      const query = ((...args: unknown[]) => {
        const statement = args[0]
        const pending = Reflect.apply(original, client, args)
        if (
          typeof statement !== 'object' ||
          statement === null ||
          !('text' in statement) ||
          typeof statement.text !== 'string'
        )
          return pending
        const values =
          'values' in statement && Array.isArray(statement.values) ? statement.values : []
        const ownRead =
          kind === 'hold'
            ? statement.text.includes('/* readUserCopyrightPreservationCoverage */') &&
              values.some(value => Array.isArray(value) && value.includes(noticeId))
            : statement.text.includes('/* readCopyrightThreadRetirement */') &&
              values.some(
                value => value === noticeId || (Array.isArray(value) && value.includes(noticeId)),
              )
        if (retired || !ownRead) return pending
        retired = true
        return Promise.resolve(pending).then(async result => {
          await retire()
          return result
        })
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    try {
      const result = await placeHold()
      if (!retired) throw new Error('Owned preservation coverage was not read')
      return result
    } finally {
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}

/** Exercise an actual borrowed assessment after reading a complete mixed marker cohort. */
export async function assessAfterMixedCopyrightRetirementRead(
  caseIds: readonly string[],
  submissionId: string,
  currentUser: import('../services/users/types.mts').PrivateUser,
  retire: () => Promise<unknown>,
) {
  await using transaction = await beginTransaction({ serializable: true })
  await readCopyrightThreadRetirement(transaction, caseIds)
  await retire()
  const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
    { submissionId, currentUser, assessedAt: new Date(), substantiallyCompliant: true },
    transaction,
  )
  await transaction.commit()
  return assessment
}

/** Seed real ledger rows and consume the production hold inventory through the same transaction. */
export async function readTestCopyrightLifecycleCoverage(
  cases: readonly string[],
  events: readonly { noticeId: string; id: string }[],
): Promise<number> {
  await using transaction = await beginTransaction()
  for (const event of events) {
    await transaction(
      `/* seedTestCopyrightLifecycleCoverage */ INSERT INTO copyright_notice_lifecycle_changes
        (id, copyright_notice_id, change_type) VALUES ($1::uuid, $2::uuid, 'notice_received')`,
      [event.id, event.noticeId],
    )
  }
  let count = 0
  const observe = (async (...args: Parameters<import('@data-stores/psql').QueryExecutor>) => {
    const result = await Reflect.apply(transaction, undefined, args)
    const row = result.rows[0] as { lifecycle_changes?: string } | undefined
    if (row?.lifecycle_changes !== undefined) count = Number(row.lifecycle_changes)
    return result
  }) as import('@data-stores/psql').QueryExecutor
  await readCopyrightCasePreservationCoverage(observe, cases)
  return count
}
