import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { beginTransaction, psql, write } from '@data-stores/psql'
import { runWithCapturedQueries } from '@data-stores/psql/query-capture'
import { sweepCopyrightReceiptReviews } from '@services/copyright-notices/retention-receipt-reviews'
import { DEFAULT_DATA_RETENTION_CONFIG } from '@services/data-retention/config'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'

import {
  inspectOutcome,
  makeOldCandidates,
  seedHolds,
  seedReviews,
  type Candidate,
} from './copyright-receipt-review-retirement-fixture.mts'

const pageSize = DEFAULT_DATA_RETENTION_CONFIG.batch_size
const oldReviewCount = pageSize * 2 + 1
const recentReviewCount = pageSize * 8
const seedEpoch = Date.UTC(2000, 0, 1)
const candidateBefore = new Date('2001-01-01T00:00:00Z')
const pageQuery = 'pageCopyrightReceiptReviewRetirement'
const deleteQuery = 'deleteExpiredCopyrightReceiptPreservationHolds'
const retireQuery = 'retireCopyrightReceiptReviewPage'
const authorizeQuery = 'enableCopyrightReceiptReviewRetirement'
const queryNames = [pageQuery, deleteQuery, retireQuery]

function sweepOnePage() {
  return sweepCopyrightReceiptReviews({ batchSize: pageSize, maxBatches: 1, now: candidateBefore })
}

async function capturePage(
  scenario: string,
  page: readonly Candidate[],
  observed: readonly Candidate[],
  previouslyScanned: readonly Candidate[],
) {
  const retired = page.filter(candidate => candidate.holdState === 0 || candidate.holdState === 3)
  const scanned = [...previouslyScanned, ...page]
  // The continuation can bitmap-scan and sort the remaining due receipts before LIMIT.
  const isContinuation = previouslyScanned.length > 0
  const remainingDue = oldReviewCount - previouslyScanned.length
  const allRetired = scanned.filter(
    candidate => candidate.holdState === 0 || candidate.holdState === 3,
  )
  registerScenarioContract(scenario, {
    allowEmptyResult: true, // DELETE without RETURNING.
    seededRows: {
      copyright_notice_email_intake_receipts: oldReviewCount + recentReviewCount,
      copyright_email_receipt_preservation_holds:
        oldReviewCount - Math.floor(oldReviewCount / 4) + recentReviewCount,
    },
    expectations: [
      { kind: 'queryBinds', token: 'LIMIT', queryContains: pageQuery },
      { kind: 'queryBinds', token: 'ANY', queryContains: deleteQuery },
      { kind: 'queryBinds', token: 'ANY', queryContains: retireQuery },
      {
        kind: 'maxProcessedRows',
        relation: 'copyright_notice_email_intake_receipts',
        captureIndex: 0,
        max: isContinuation ? remainingDue : pageSize,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'copyright_email_receipt_preservation_holds',
        captureIndex: 1,
        max: 375,
      },
      // The gate counts the indexed target read and the UPDATE output.
      {
        kind: 'maxProcessedRows',
        relation: 'copyright_notice_email_intake_receipts',
        captureIndex: 2,
        max: 2 * pageSize,
      },
      // This limits calls, not the work inside each call. See #6568.
      {
        kind: 'maxFunctionCalls',
        function: 'fn_copyright_receipt_review_retirement_eligible',
        max: 2 * pageSize,
      },
      {
        kind: 'maxInputRows',
        nodeType: 'Sort',
        captureIndex: 0,
        max: isContinuation ? remainingDue : 0,
      },
      { kind: 'maxInputRows', nodeType: 'Sort', captureIndex: 1, max: 0 },
      { kind: 'maxInputRows', nodeType: 'Sort', captureIndex: 2, max: 0 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      // The sweep owns its transaction, and the database will not let us restore cleared review
      // facts. Run every real statement, assert its effects on that connection, then roll back at
      // the adapter's commit boundary so both EXPLAIN modes can replay the original bindings.
      const begin = psql.beginBoundedTransaction
      psql.beginBoundedTransaction = async options => {
        const transaction = await begin(options)
        transaction.commit = async () => {
          await runWithCapturedQueries(() =>
            inspectOutcome(transaction, observed, allRetired, scanned),
          )
          await transaction.rollback()
        }
        return transaction
      }
      try {
        assert.deepEqual(await sweepOnePage(), {
          scanned: pageSize,
          retired: retired.length,
          hasMore: true,
        })
      } finally {
        psql.beginBoundedTransaction = begin
      }
    },
    undefined,
    queryNames,
    {
      localSettings: { 'app.copyright_receipt_review_retirement': 'on' },
      exactCapturedNames: [pageQuery, authorizeQuery, deleteQuery, retireQuery],
      useWallClock: true,
    },
  )
}

export async function runCopyrightReceiptReviewRetirementCapacity(): Promise<void> {
  const timestamp = seedEpoch + randomInt(86_400_000)
  const recentTimestamp = Date.now()
  const candidates = makeOldCandidates(timestamp, oldReviewCount)
  const oldIds = candidates.map(candidate => candidate.id)
  const recentIds = Array.from({ length: recentReviewCount }, (_, index) =>
    seedUuidAtTimestamp(recentTimestamp - 31_536_000_000, index),
  )
  const firstPage = candidates.slice(0, pageSize)
  const continuation = candidates.slice(pageSize, 2 * pageSize)
  assert.equal(
    (await seedReviews(timestamp, oldIds, recentIds)).rowCount,
    oldIds.length + recentIds.length,
  )
  try {
    assert.equal(
      (await seedHolds(candidates, recentIds, recentTimestamp, candidateBefore)).rowCount,
      candidates.filter(candidate => candidate.holdId !== null).length + recentIds.length,
    )
    await write(
      '/* analyzeCopyrightReceiptReviewCapacity */ ANALYZE copyright_notice_email_intake_receipts, copyright_email_receipt_preservation_holds',
    )
    await capturePage('copyright-receipt-review-retirement-first-page', firstPage, candidates, [])
    // Move the first page out of the due window through the real sweep before capturing the next.
    assert.deepEqual(await sweepOnePage(), {
      scanned: pageSize,
      retired: pageSize / 2,
      hasMore: true,
    })
    // Exercise the post-autovacuum visibility-map and stats state directly (#6778).
    await write(
      '/* vacuumAnalyzeCopyrightReceiptReviewContinuation */ VACUUM (ANALYZE) copyright_notice_email_intake_receipts',
    )
    await capturePage(
      'copyright-receipt-review-retirement-continuation',
      continuation,
      candidates,
      firstPage,
    )
  } finally {
    // Replay receipts and their protected holds cannot be deleted. Defer only owned due fixtures.
    await using transaction = await beginTransaction()
    await transaction(sql`/* enableCopyrightReceiptCapacityCleanup */
      SELECT set_config('app.copyright_receipt_review_retirement', 'on', true)`)
    await transaction(sql`/* deferCopyrightReceiptCapacityCleanup */
      UPDATE copyright_notice_email_intake_receipts
      SET review_retirement_check_at = CURRENT_TIMESTAMP + interval '1 day'
      WHERE id = ANY(${oldIds}::uuid[]) AND review_decision IS NOT NULL
        AND review_retirement_check_at < CURRENT_TIMESTAMP + interval '1 day'`)
    await transaction.commit()
  }
}
