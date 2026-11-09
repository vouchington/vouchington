import { beginTransaction, write } from '@data-stores/psql'
import { getActiveApiKeyOwnerRole } from '@services/api-keys/lifetime'
import { persistXRefreshedTokens } from '@services/oauth-x/friends-persistence'
import {
  getBlueskyFollowReceipt,
  saveBlueskyFollowReceipt,
} from '@services/bluesky-follows/receipts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

/** Role checks read the active owner by id without a user-lifecycle fence. */
export async function runLockScopeDomainScenarios(): Promise<void> {
  registerScenarioContract('api-key-active-owner-role', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
      { kind: 'maxProcessedRows', relation: 'user_roles', max: 4 },
    ],
  })
  await runAndCapture(
    'api-key-active-owner-role',
    async () => {
      await using transaction = await beginTransaction()
      await getActiveApiKeyOwnerRole(transaction, seedUser.id)
      await transaction.commit()
    },
    undefined,
    'getActiveApiKeyOwnerRole',
  )
  const xId = `explain-lock-scope-${crypto.randomUUID()}`
  await write(
    `/* seedExplainXRefreshOwner */ INSERT INTO x_accounts (user_id, x_user_id, x_user_data, access_token_ciphertext)
     VALUES ($1::uuid, $2, '{}'::jsonb, 'explain-ciphertext')`,
    [seedUser.id, xId],
  )
  registerScenarioContract('x-refresh-active-owner', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
      { kind: 'maxProcessedRows', relation: 'x_accounts', max: 2 },
    ],
  })
  try {
    await runAndCapture(
      'x-refresh-active-owner',
      () =>
        persistXRefreshedTokens(
          xId,
          seedUser.id,
          {
            accessTokenCiphertext: 'explain-ciphertext',
            refreshTokenCiphertext: null,
            accessTokenExpiresAt: null,
          },
          { accessToken: 'explain-refresh', refreshToken: null, expiresAt: null },
        ),
      undefined,
      'updateXTokens',
      {
        afterCapture: async () => {
          await write(
            `/* resetExplainXRefreshGeneration */ UPDATE x_accounts SET access_token_ciphertext = 'explain-ciphertext',
              refresh_token_ciphertext = NULL, access_token_expires_at = NULL WHERE x_user_id = $1`,
            [xId],
          )
        },
      },
    )
  } finally {
    await write('/* cleanupExplainXRefreshOwner */ DELETE FROM x_accounts WHERE x_user_id = $1', [
      xId,
    ])
  }
  const followerId = seedUuid(4, '01')
  const did = `did:plc:explain${crypto.randomUUID().replaceAll('-', '')}`
  const authorization = await write<{ id: string }>(
    `/* seedExplainBlueskyAuthorization */ INSERT INTO bluesky_link_authorizations
       (user_id, handle, callback_mode, callback_claimed_at, claimed_did, attached_at, expires_at)
     VALUES ($1::uuid, 'explain.example', 'web', now(), $2, now(), now() + INTERVAL '1 day') RETURNING id`,
    [followerId, did],
  )
  const authorizationId = authorization.rows[0]!.id
  await write(
    `/* seedExplainBlueskyAccount */ INSERT INTO bluesky_linked_accounts
       (link_authorization_id, bluesky_did, user_id, session_ciphertext)
     VALUES ($1::uuid, $2, $3::uuid, 'explain')`,
    [authorizationId, did, followerId],
  )
  for (const id of ['bluesky-live-receipt-write', 'bluesky-live-receipt-read']) {
    registerScenarioContract(id, {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'users', max: 4 },
        { kind: 'maxProcessedRows', relation: 'bluesky_linked_accounts', max: 2 },
        { kind: 'maxProcessedRows', relation: 'bluesky_follow_records', max: 2 },
      ],
    })
  }
  try {
    await write(
      `/* seedExplainBlueskyReceiptNoise */ INSERT INTO bluesky_follow_records
         (follower_user_id, followee_user_id, follower_account_link_authorization_id, record_uri)
       SELECT $1::uuid, id, $2::uuid, 'at://' || $3 || '/app.bsky.graph.follow/explain-' || id
       FROM users WHERE deleted_at IS NULL AND id <> $4::uuid
       ORDER BY id LIMIT 2000
       ON CONFLICT (follower_user_id, followee_user_id) DO NOTHING`,
      [followerId, authorizationId, did, seedUser.id],
    )
    await write('/* analyzeExplainBlueskyReceiptNoise */ ANALYZE bluesky_follow_records')
    await runAndCapture(
      'bluesky-live-receipt-write',
      () =>
        saveBlueskyFollowReceipt(
          followerId,
          seedUser.id,
          did,
          authorizationId,
          `at://${did}/app.bsky.graph.follow/explain`,
        ),
      undefined,
      'saveBlueskyFollowReceipt',
    )
    await runAndCapture(
      'bluesky-live-receipt-read',
      () => getBlueskyFollowReceipt(followerId, seedUser.id, did, authorizationId),
      undefined,
      'getBlueskyFollowReceipt',
    )
  } finally {
    await write(
      '/* cleanupExplainBlueskyReceipt */ DELETE FROM bluesky_follow_records WHERE follower_account_link_authorization_id = $1::uuid',
      [authorizationId],
    )
    await write(
      '/* cleanupExplainBlueskyAccount */ DELETE FROM bluesky_linked_accounts WHERE link_authorization_id = $1::uuid',
      [authorizationId],
    )
    await write(
      '/* cleanupExplainBlueskyAuthorization */ DELETE FROM bluesky_link_authorizations WHERE id = $1::uuid',
      [authorizationId],
    )
    await write('/* vacuumExplainBlueskyReceiptNoise */ VACUUM (ANALYZE) bluesky_follow_records')
  }
}
