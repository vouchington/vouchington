import { write } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'

export const RECEIPT_COUNT = 15_000
export const TOTAL_RECEIPT_COUNT = RECEIPT_COUNT + 20_000
export const FOLLOWER_ID = seedUuid(10, '01')
export const AUTHORIZATION_ID = seedUuid(1, 'b1')
export const FOLLOWER_DID = 'did:plc:explainblueskyfollower'
export const FOLLOWEE_ID = seedUuid(100, '01')
export const RECORD_URI = `at://${FOLLOWER_DID}/app.bsky.graph.follow/1`
const NOISE_AUTH_IDS = Array.from({ length: 1000 }, (_, index) => seedUuid(index, 'b2'))
const NOISE_USER_IDS = Array.from({ length: 1000 }, (_, index) => seedUuid(16000 + index, '01'))
export async function seedFollowerReceipts(): Promise<void> {
  await write(
    `/* seedExplainBlueskyFollower:noiseAuthorizations */ INSERT INTO bluesky_link_authorizations
       (id, user_id, handle, callback_mode, callback_claimed_at, claimed_did, attached_at, expires_at)
     SELECT auth_id, user_id, 'noise.example', 'web', now(), 'did:plc:explainnoise' || ordinal, now(), now() + INTERVAL '1 day'
     FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS input(auth_id, user_id, ordinal)`,
    [NOISE_AUTH_IDS, NOISE_USER_IDS],
  )
  await write(
    `/* seedExplainBlueskyFollower:noiseAccounts */ INSERT INTO bluesky_linked_accounts
       (link_authorization_id, bluesky_did, user_id, handle, session_ciphertext)
     SELECT auth_id, 'did:plc:explainnoise' || ordinal, user_id, 'noise.example', 'explain'
     FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS input(auth_id, user_id, ordinal)`,
    [NOISE_AUTH_IDS, NOISE_USER_IDS],
  )
  await write(
    `/* seedExplainBlueskyFollower:authorization */ INSERT INTO bluesky_link_authorizations
       (id, user_id, handle, callback_mode, callback_claimed_at, claimed_did, attached_at, expires_at)
     VALUES ($1, $2, 'follower.example', 'web', now(), $3, now(), now() + INTERVAL '1 day')
     ON CONFLICT DO NOTHING`,
    [AUTHORIZATION_ID, FOLLOWER_ID, FOLLOWER_DID],
  )
  await write(
    `/* seedExplainBlueskyFollower:account */ INSERT INTO bluesky_linked_accounts
       (link_authorization_id, bluesky_did, user_id, handle, session_ciphertext)
     VALUES ($1, $2, $3, 'follower.example', 'explain')
     ON CONFLICT DO NOTHING`,
    [AUTHORIZATION_ID, FOLLOWER_DID, FOLLOWER_ID],
  )
  for (let offset = 0; offset < RECEIPT_COUNT; offset += 500) {
    // Each bounded autocommit batch releases user-mutation advisory locks before the next batch.
    await write(
      `/* seedExplainBlueskyFollower:receipts */ INSERT INTO bluesky_follow_records
         (follower_user_id, followee_user_id, follower_account_link_authorization_id, record_uri)
       SELECT $1::uuid, followee_id, $2::uuid, 'at://' || $3::text || '/app.bsky.graph.follow/' || (ordinal + $5::int)
       FROM unnest($4::uuid[]) WITH ORDINALITY AS input(followee_id, ordinal)
       ON CONFLICT DO NOTHING`,
      [
        FOLLOWER_ID,
        AUTHORIZATION_ID,
        FOLLOWER_DID,
        Array.from({ length: Math.min(500, RECEIPT_COUNT - offset) }, (_, index) =>
          seedUuid(100 + offset + index, '01'),
        ),
        offset,
      ],
    )
  }
  for (let offset = 0; offset < NOISE_AUTH_IDS.length; offset += 25) {
    // 25 followers × 20 followees per autocommit statement bounds advisory locks.
    // no-mistakes-disable-next-line query-reached-per-item: fixed interleaved fixture chunks commit separately to release user advisory locks
    await write(
      `/* seedExplainBlueskyFollower:noiseReceipts */ INSERT INTO bluesky_follow_records
         (follower_user_id, followee_user_id, follower_account_link_authorization_id, record_uri)
       SELECT input.user_id, target.followee_id, input.auth_id,
              'at://did:plc:explainnoise/app.bsky.graph.follow/' || target.ordinal
       FROM unnest($1::uuid[], $2::uuid[]) AS input(auth_id, user_id)
       CROSS JOIN unnest($3::uuid[]) WITH ORDINALITY AS target(followee_id, ordinal)`,
      [
        NOISE_AUTH_IDS.slice(offset, offset + 25),
        NOISE_USER_IDS.slice(offset, offset + 25),
        Array.from({ length: 20 }, (_, index) => seedUuid(100 + index, '01')),
      ],
    )
  }
  await write(
    '/* seedExplainBlueskyFollower:analyze */ ANALYZE bluesky_follow_records, bluesky_linked_accounts',
  )
}

export async function removeFollowerReceipts(): Promise<void> {
  await write(
    '/* seedExplainBlueskyFollower:removeNoiseAccounts */ DELETE FROM bluesky_linked_accounts WHERE link_authorization_id = ANY($1::uuid[])',
    [NOISE_AUTH_IDS],
  )
  await write(
    '/* seedExplainBlueskyFollower:removeNoiseAuthorizations */ DELETE FROM bluesky_link_authorizations WHERE id = ANY($1::uuid[])',
    [NOISE_AUTH_IDS],
  )
  await write(
    '/* seedExplainBlueskyFollower:removeReceipts */ DELETE FROM bluesky_follow_records WHERE follower_account_link_authorization_id = $1',
    [AUTHORIZATION_ID],
  )
  await write(
    '/* seedExplainBlueskyFollower:removeAccount */ DELETE FROM bluesky_linked_accounts WHERE link_authorization_id = $1',
    [AUTHORIZATION_ID],
  )
  await write(
    '/* seedExplainBlueskyFollower:removeAuthorization */ DELETE FROM bluesky_link_authorizations WHERE id = $1',
    [AUTHORIZATION_ID],
  )
  await write(
    '/* seedExplainBlueskyFollower:restoreStats */ ANALYZE bluesky_follow_records, bluesky_linked_accounts',
  )
}
