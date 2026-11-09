import { beginTransaction, write } from '@data-stores/psql'
import {
  deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage,
  START_OF_IDS,
} from '@services/bluesky-follows/receipts'
import { getBlueskyFollowsWorkLimit } from '@services/bluesky-follows/work-limits'

import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

// Large enough that the planner probes rows by ctid instead of scanning the whole table.
const FOLLOWER_COUNT = 15_000
const FOLLOWEE_ID = seedUuid(5, '01')
const OTHER_FOLLOWEE_IDS = Array.from({ length: 20 }, (_, index) => seedUuid(20 + index, '01'))
const HOLDER_USER_ID = seedUuid(9, '01')
const AUTHORIZATION_ID = seedUuid(0, 'b1')
const HOLDER_DID = 'did:plc:explainblueskyreceipts'
const SCENARIO_QUERY = 'deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage'

/** One followee with many followers: each drain page is an ordered index range, never a Sort. */
async function seedFolloweeReceipts(): Promise<void> {
  await write(
    `/* seedExplainBlueskyReceipts:authorization */ INSERT INTO bluesky_link_authorizations
       (id, user_id, handle, callback_mode, callback_claimed_at, claimed_did, attached_at, expires_at)
     VALUES ($1, $2, 'explain.example', 'web', now(), $3, now(), now() + INTERVAL '1 day')
     ON CONFLICT DO NOTHING`,
    [AUTHORIZATION_ID, HOLDER_USER_ID, HOLDER_DID],
  )
  await write(
    `/* seedExplainBlueskyReceipts:account */ INSERT INTO bluesky_linked_accounts
       (link_authorization_id, bluesky_did, user_id, handle, session_ciphertext)
     VALUES ($1, $2, $3, 'explain.example', 'explain')
     ON CONFLICT DO NOTHING`,
    [AUTHORIZATION_ID, HOLDER_DID, HOLDER_USER_ID],
  )
  for (let offset = 0; offset < FOLLOWER_COUNT; offset += 500) {
    // Interleave popular followees for each follower to exercise a dense follower-first index.
    // This distribution exposes plans that walk that index instead of the followee range.
    // Each autocommit batch releases the active-user advisory locks before the next batch.
    await write(
      `/* seedExplainBlueskyReceipts:receipts */ INSERT INTO bluesky_follow_records
         (follower_user_id, followee_user_id, follower_account_link_authorization_id, record_uri)
       SELECT follower_id, followee_id, $3::uuid,
         'at://' || $4::text || '/app.bsky.graph.follow/' || (ordinal + $5::int) || '-' || followee_id
       FROM unnest($1::uuid[]) WITH ORDINALITY AS input(follower_id, ordinal)
       CROSS JOIN unnest($2::uuid[]) AS followee(followee_id)
       ON CONFLICT DO NOTHING`,
      [
        Array.from({ length: Math.min(500, FOLLOWER_COUNT - offset) }, (_, index) =>
          seedUuid(100 + offset + index, '01'),
        ),
        [FOLLOWEE_ID, ...OTHER_FOLLOWEE_IDS],
        AUTHORIZATION_ID,
        HOLDER_DID,
        offset,
      ],
    )
  }
  // Without statistics the planner assumes a tiny table and picks a bitmap scan plus Sort.
  await write('/* seedExplainBlueskyReceipts:analyze */ ANALYZE bluesky_follow_records')
}

async function removeFolloweeReceipts(): Promise<void> {
  await write(
    '/* seedExplainBlueskyReceipts:removeReceipts */ DELETE FROM bluesky_follow_records WHERE follower_account_link_authorization_id = $1',
    [AUTHORIZATION_ID],
  )
  await write(
    '/* seedExplainBlueskyReceipts:removeAccount */ DELETE FROM bluesky_linked_accounts WHERE link_authorization_id = $1',
    [AUTHORIZATION_ID],
  )
  await write(
    '/* seedExplainBlueskyReceipts:removeAuthorization */ DELETE FROM bluesky_link_authorizations WHERE id = $1',
    [AUTHORIZATION_ID],
  )
  await write(
    '/* seedExplainBlueskyReceipts:restoreStats */ ANALYZE bluesky_follow_records, bluesky_linked_accounts',
  )
}

async function deletePageInRolledBackTransaction(after: string): Promise<void> {
  await using transaction = await beginTransaction()
  const page = await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
    FOLLOWEE_ID,
    after,
    { query: transaction },
  )
  await transaction.rollback()
  if (!page.hasMore || page.lastFollowerUserId === null)
    throw new Error('Expected a full page of followee receipts')
}

export async function runBlueskyFolloweeReceiptScenarios(): Promise<void> {
  // The page size is the production LIMIT, so the bound and continuation seed follow its config.
  const pageSize = getBlueskyFollowsWorkLimit('backfill_batch_size')
  if (FOLLOWER_COUNT < 10 * pageSize)
    throw new Error('FOLLOWER_COUNT must stay well above three pages of followee receipts')
  for (const id of ['bluesky-followee-receipts-page', 'bluesky-followee-receipts-continuation']) {
    registerScenarioContract(id, {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_bluesky_follow_records__followee_follower'],
          noSort: true,
        },
        // Each page row is counted by three nodes: the ordered index scan, the ctid fetch, and the
        // Delete itself. Anything near FOLLOWER_COUNT would mean the page walked the whole followee.
        { kind: 'maxProcessedRows', relation: 'bluesky_follow_records', max: 3 * pageSize },
      ],
      seededRows: { bluesky_follow_records: FOLLOWER_COUNT * (1 + OTHER_FOLLOWEE_IDS.length) },
    })
  }
  try {
    await seedFolloweeReceipts()
    await runAndCapture(
      'bluesky-followee-receipts-page',
      () => deletePageInRolledBackTransaction(START_OF_IDS),
      undefined,
      SCENARIO_QUERY,
    )
    await runAndCapture(
      'bluesky-followee-receipts-continuation',
      () => deletePageInRolledBackTransaction(seedUuid(100 + pageSize, '01')),
      undefined,
      SCENARIO_QUERY,
    )
  } finally {
    await removeFolloweeReceipts()
  }
}
