import { beginTransaction, write } from '@data-stores/psql'
import {
  deleteBlueskyFollowReceipts,
  getBlueskyFollowReceipt,
  listBlueskyFollowReceiptsForFollower,
  saveBlueskyFollowReceipt,
} from '@services/bluesky-follows/receipts'
import { getBlueskyFollowsWorkLimit } from '@services/bluesky-follows/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  AUTHORIZATION_ID,
  FOLLOWEE_ID,
  FOLLOWER_DID,
  FOLLOWER_ID,
  RECEIPT_COUNT,
  TOTAL_RECEIPT_COUNT,
  RECORD_URI,
  removeFollowerReceipts,
  seedFollowerReceipts,
} from './bluesky-follower-receipt-fixture.mts'

export async function runBlueskyFollowerReceiptScenarios(): Promise<void> {
  const pageSize = getBlueskyFollowsWorkLimit('disconnect_batch_size')
  const INDEX = 'idx_bluesky_follow_records__authorization_follower_followee'
  const pageIndexes = {
    kind: 'usesIndexes' as const,
    indexes: ['bluesky_follow_records_pkey', INDEX],
    anyOf: true,
    noSort: true,
  }
  for (const id of [
    'bluesky-follower-receipts-page',
    'bluesky-follower-receipts-continuation',
    'bluesky-follower-receipts-empty',
  ]) {
    registerScenarioContract(id, {
      allowEmptyResult: id === 'bluesky-follower-receipts-empty',
      expectations: [
        { kind: 'noSeqScan', relation: 'bluesky_follow_records' },
        ...(id === 'bluesky-follower-receipts-empty' ? [] : [pageIndexes]),
        { kind: 'maxProcessedRows', relation: 'bluesky_follow_records', max: pageSize },
      ],
      seededRows: { bluesky_follow_records: TOTAL_RECEIPT_COUNT },
    })
  }
  registerScenarioContract('bluesky-follower-receipts-delete', {
    allowEmptyResult: true,
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'bluesky_follow_records_pkey',
          INDEX,
          'idx_bluesky_follow_records__followee_follower',
        ],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'bluesky_follow_records', max: 3 * pageSize },
      { kind: 'maxProcessedRows', relation: 'bluesky_linked_accounts', max: 2 * pageSize },
    ],
    seededRows: { bluesky_follow_records: TOTAL_RECEIPT_COUNT },
  })
  for (const id of [
    'bluesky-follower-receipt-get-active',
    'bluesky-follower-receipt-get-pending',
    'bluesky-follower-receipt-save-active',
    'bluesky-follower-receipt-save-pending',
  ]) {
    registerScenarioContract(id, {
      allowEmptyResult: id.endsWith('-pending') || id.includes('-save-'),
      expectations: [
        { kind: 'maxProcessedRows', relation: 'bluesky_follow_records', max: 2 },
        { kind: 'maxProcessedRows', relation: 'bluesky_linked_accounts', max: 1 },
      ],
      seededRows: { bluesky_follow_records: TOTAL_RECEIPT_COUNT },
    })
  }
  try {
    await seedFollowerReceipts()
    for (const [id, cursor] of [
      ['bluesky-follower-receipts-page', null],
      ['bluesky-follower-receipts-continuation', seedUuid(100 + pageSize - 1, '01')],
      ['bluesky-follower-receipts-empty', seedUuid(100 + RECEIPT_COUNT, '01')],
    ] as const) {
      // no-mistakes-disable-next-line query-reached-per-item: three fixed plan scenarios require serialized process-global capture
      await runAndCapture(
        id,
        async () => {
          const page = await listBlueskyFollowReceiptsForFollower(
            FOLLOWER_ID,
            FOLLOWER_DID,
            AUTHORIZATION_ID,
            cursor,
            pageSize,
          )
          const expected = id === 'bluesky-follower-receipts-empty' ? 0 : pageSize
          if (page.length !== expected) throw new Error(`Expected ${expected} follower receipts`)
        },
        undefined,
        'listBlueskyFollowReceiptsForFollower',
      )
    }
    await runAndCapture(
      'bluesky-follower-receipts-delete',
      async () => {
        await using transaction = await beginTransaction()
        const ids = Array.from({ length: pageSize }, (_, index) => seedUuid(100 + index, '01'))
        const count = async () => {
          const { rows } = await transaction<{ count: string }>(
            '/* assertExplainFollowerDelete */ SELECT count(*)::text AS count FROM bluesky_follow_records WHERE follower_user_id = $1 AND followee_user_id = ANY($2::uuid[])',
            [FOLLOWER_ID, ids],
          )
          return Number(rows[0]?.count)
        }
        if ((await count()) !== pageSize) throw new Error('Expected a full receipt batch to delete')
        await deleteBlueskyFollowReceipts(
          FOLLOWER_ID,
          Array.from({ length: pageSize }, (_, index) => ({
            followeeUserId: seedUuid(100 + index, '01'),
            recordUri: `at://${FOLLOWER_DID}/app.bsky.graph.follow/${index + 1}`,
          })),
          FOLLOWER_DID,
          AUTHORIZATION_ID,
          { query: transaction },
        )
        if ((await count()) !== 0) throw new Error('Receipt batch delete did not remove every row')
        await transaction.rollback()
      },
      undefined,
      'deleteBlueskyFollowReceipts',
    )
    await captureGetAndSave(false)
    await write(
      '/* seedExplainBlueskyFollower:pending */ UPDATE bluesky_linked_accounts SET disconnect_requested_at = now() WHERE link_authorization_id = $1',
      [AUTHORIZATION_ID],
    )
    await captureGetAndSave(true)
  } finally {
    await removeFollowerReceipts()
  }
}

async function captureGetAndSave(pending: boolean): Promise<void> {
  const state = pending ? 'pending' : 'active'
  await runAndCapture(
    `bluesky-follower-receipt-get-${state}`,
    async () => {
      const receipt = await getBlueskyFollowReceipt(
        FOLLOWER_ID,
        FOLLOWEE_ID,
        FOLLOWER_DID,
        AUTHORIZATION_ID,
      )
      if ((receipt === null) !== pending) throw new Error(`Unexpected ${state} receipt lookup`)
    },
    undefined,
    'getBlueskyFollowReceipt',
  )
  await runAndCapture(
    `bluesky-follower-receipt-save-${state}`,
    async () => {
      await using transaction = await beginTransaction()
      try {
        const replacementUri = `${RECORD_URI}-updated`
        const readUri = async () => {
          const { rows } = await transaction<{ record_uri: string }>(
            '/* assertExplainFollowerSave */ SELECT record_uri FROM bluesky_follow_records WHERE follower_user_id = $1 AND followee_user_id = $2',
            [FOLLOWER_ID, FOLLOWEE_ID],
          )
          return rows[0]?.record_uri
        }
        if ((await readUri()) !== RECORD_URI) throw new Error('Expected the original receipt URI')
        await saveBlueskyFollowReceipt(
          FOLLOWER_ID,
          FOLLOWEE_ID,
          FOLLOWER_DID,
          AUTHORIZATION_ID,
          replacementUri,
          { query: transaction },
        )
        if (pending) throw new Error('Pending receipt save unexpectedly succeeded')
        if ((await readUri()) !== replacementUri)
          throw new Error('Receipt save did not update the URI')
      } catch (err) {
        if (
          !pending ||
          !(err instanceof Error) ||
          err.message !== 'Exact Bluesky account generation is missing or user is inactive'
        )
          throw err
      } finally {
        await transaction.rollback()
      }
    },
    undefined,
    'saveBlueskyFollowReceipt',
  )
}
