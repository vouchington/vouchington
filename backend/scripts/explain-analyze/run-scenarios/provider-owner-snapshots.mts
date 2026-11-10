import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { write } from '@data-stores/psql'
import { revokeApiKey } from '@services/api-keys/revoke'
import {
  persistFacebookFriendPage,
  finalizeFacebookFriendSync,
} from '@services/oauth-facebook/friends-persistence'
import {
  persistGithubFriendPage,
  finalizeGithubFriendSync,
} from '@services/oauth-github/friends-persistence'
import { persistXFriendPage, finalizeXFriendSync } from '@services/oauth-x/friend-pages'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

/** Owned accounts exercise the same predicates against the large seeded provider corpus. */
export async function runProviderOwnerSnapshotScenarios(): Promise<void> {
  await captureProvider('facebook', persistFacebookFriendPage, finalizeFacebookFriendSync)
  await captureProvider('github', persistGithubFriendPage, finalizeGithubFriendSync)
  await captureProvider('x', persistXFriendPage, finalizeXFriendSync)
  await captureApiKeyRevocation()
}

type PersistPage = typeof persistFacebookFriendPage
type FinalizeSync = (accountId: string, userId: string, syncTime: string) => Promise<string | null>

async function captureProvider(
  provider: 'facebook' | 'github' | 'x',
  persist: PersistPage,
  finalize: FinalizeSync,
): Promise<void> {
  const accounts = `${provider}_accounts`
  const friends = `${provider}_friends`
  const accountColumn = `${provider}_account_id`
  const friendColumn = `${provider}_friend_id`
  const name = provider === 'x' ? 'X' : provider === 'github' ? 'Github' : 'Facebook'
  const id = `${provider}-friend-owner-snapshot`
  const created = await write<{ id: string }>(
    `/* seedExplainProviderOwner */ INSERT INTO ${accounts}
       (user_id, ${provider}_user_id, ${provider}_user_data)
     VALUES ($1::uuid, $2, '{}'::jsonb) RETURNING id`,
    [seedUuid(19_995, '01'), `explain-owner-${randomUUID()}`],
  )
  const accountId = created.rows[0]!.id
  let noiseAccountId: string | undefined
  const oldTime = '2020-01-01T00:00:00.000Z'
  const syncTime = '2030-01-01T00:00:00.000Z'
  const restoreStaleEdge = () =>
    write(
      `/* seedExplainStaleFriend */ INSERT INTO ${friends}
         (${accountColumn}, ${friendColumn}, last_observed_at)
       VALUES ($1::uuid, 'explain-stale', $2::timestamptz)
       ON CONFLICT (${accountColumn}, ${friendColumn}) DO UPDATE
         SET last_observed_at = EXCLUDED.last_observed_at`,
      [accountId, oldTime],
    )
  registerScenarioContract(id, {
    // Friend writes deliberately have no RETURNING; callback assertions prove their effects.
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 4 },
      { kind: 'maxProcessedRows', relation: accounts, max: 8 },
      { kind: 'maxProcessedRows', relation: friends, max: 8 },
    ],
  })
  try {
    if (provider === 'github') {
      const noiseAccount = await write<{ id: string }>(
        `/* seedExplainGithubFriendNoiseOwner */ INSERT INTO github_accounts
           (user_id, github_user_id, github_user_data)
         VALUES ($1::uuid, $2, '{}'::jsonb) RETURNING id`,
        [seedUuid(19_993, '01'), `explain-noise-${randomUUID()}`],
      )
      noiseAccountId = noiseAccount.rows[0]!.id
      await write(
        `/* seedExplainGithubFriendNoise */ INSERT INTO github_friends (github_account_id, github_friend_id)
         SELECT $1::uuid, 'explain-noise-' || n FROM generate_series(1, 2000) AS n`,
        [noiseAccountId],
      )
      await write('/* analyzeExplainGithubFriendNoise */ ANALYZE github_friends')
    }
    await restoreStaleEdge()
    await runAndCapture(
      id,
      async () => {
        assert.equal(
          await persist(accountId, seedUuid(19_995, '01'), ['explain-current'], syncTime),
          true,
        )
        assert.equal(await finalize(accountId, seedUuid(19_995, '01'), syncTime), null)
        const result = await write<{ synced: boolean; friend_ids: string[] }>(
          `/* verifyExplainProviderSync */ SELECT friends_synced_at IS NOT NULL AS synced,
             ARRAY(SELECT ${friendColumn} FROM ${friends} WHERE ${accountColumn} = $1::uuid
               ORDER BY ${friendColumn}) AS friend_ids
           FROM ${accounts} WHERE id = $1::uuid`,
          [accountId],
        )
        assert.deepEqual(result.rows, [{ synced: true, friend_ids: ['explain-current'] }])
      },
      undefined,
      [
        `${provider}SyncOwnerExists`,
        `persist${name}FriendBatch`,
        `getStale${name}FriendIds`,
        `delete${name}FriendBatch`,
        `mark${name}FriendSyncComplete`,
      ],
      {
        afterCapture: async () => {
          await restoreStaleEdge()
        },
      },
    )
  } finally {
    if (noiseAccountId) {
      await write(
        '/* cleanupExplainGithubFriendNoise */ DELETE FROM github_accounts WHERE id = $1::uuid',
        [noiseAccountId],
      )
      await write('/* analyzeAfterExplainGithubFriendNoise */ ANALYZE github_friends')
    }
    await write(`/* cleanupExplainProviderOwner */ DELETE FROM ${accounts} WHERE id = $1::uuid`, [
      accountId,
    ])
  }
}

async function captureApiKeyRevocation(): Promise<void> {
  const key = { prefix: 'explain-revoke', keyHash: randomBytes(32) }
  const created = await write<{ id: string }>(
    `/* seedExplainRevokeKey */ INSERT INTO api_keys (user_id, prefix, key_hash, type)
     VALUES ($1::uuid, $2, $3, 'rss') RETURNING id`,
    [seedUser.id, key.prefix, key.keyHash],
  )
  const keyId = created.rows[0]!.id
  registerScenarioContract('api-key-revoke-owner-snapshot', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
      { kind: 'maxProcessedRows', relation: 'api_keys', max: 2 },
    ],
  })
  try {
    await runAndCapture(
      'api-key-revoke-owner-snapshot',
      async () => {
        assert.equal(await revokeApiKey(seedUser.id, keyId), true)
      },
      undefined,
      'revokeApiKey',
      {
        afterCapture: async () => {
          await write(
            '/* resetExplainRevokeKey */ UPDATE api_keys SET revoked_at = NULL WHERE id = $1::uuid',
            [keyId],
          )
        },
      },
    )
  } finally {
    await write('/* cleanupExplainRevokeKey */ DELETE FROM api_keys WHERE id = $1::uuid', [keyId])
  }
}
