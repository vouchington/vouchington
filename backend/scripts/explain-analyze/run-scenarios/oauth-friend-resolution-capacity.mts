import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { resolveFriendReferencePage } from '@services/oauth-accounts/resolve-friend-reference-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'

const providers = ['facebook', 'github', 'x'] as const
// OAuth connect uses this default from oauth-accounts/work-limits.mts (hard maximum 1,000).
const connectBatchSize = 100
const eligibleCount = connectBatchSize + 1
const staleCount = 4
const linkedCount = 4
const ownerCount = eligibleCount + staleCount + linkedCount
const unrelatedCount = 6_000
const totalEdges = ownerCount + unrelatedCount
const boundary = '2026-01-01T00:00:00Z'
const updateName = 'resolveFriendReferencePage'
const probeName = 'hasUnresolvedFriendReferences'
const inspectName = 'inspectExplainOAuthFriendResolution'

export async function runOAuthFriendResolutionCapacityScenarios(): Promise<void> {
  for (const provider of providers) {
    const accounts = `${provider}_accounts`
    const friends = `${provider}_friends`
    const linkedAccountColumn = `friend_${provider}_account_id`
    const ownerColumn = `${provider}_account_id`
    const externalFriendColumn = `${provider}_friend_id`
    const prefix = `explain-fr-${randomUUID().slice(0, 12)}`
    const externalTargetId = `${prefix}-target`
    const timestamp = Date.now() - randomInt(2 ** 30)
    const fixtureId = (index: number) => seedUuidAtTimestamp(timestamp, index)
    const ownerIds = Array.from({ length: ownerCount }, (_, index) => fixtureId(index))
    const targetId = fixtureId(ownerCount)
    const edgeIds = Array.from({ length: totalEdges }, (_, index) =>
      fixtureId(ownerCount + 1 + index),
    )
    const eligibleIds = new Set(edgeIds.slice(0, eligibleCount))
    const firstPageIds = new Set(edgeIds.slice(0, connectBatchSize))
    const allAccountIds = [...ownerIds, targetId]

    const user = await write<{ id: string }>(
      '/* seedExplainOAuthFriendResolutionUser */ INSERT INTO users (username) VALUES ($1) RETURNING id',
      [prefix],
    )
    const userId = user.rows[0]!.id

    try {
      const seededAccounts = await write(
        `/* seedExplainOAuthFriendResolutionAccounts */
         INSERT INTO ${accounts} (id, ${provider}_user_id, ${provider}_user_data, user_id,
           unlinked_at, friend_edges_invalidated_at, friend_references_resolve_pending_at)
         SELECT owner, $2 || '-' || ordinality, '{}'::jsonb, NULL, $4::timestamptz, NULL, NULL
         FROM unnest($1::uuid[]) WITH ORDINALITY AS source(owner, ordinality)
         UNION ALL SELECT $3::uuid, $2, '{}'::jsonb, $5::uuid, NULL, $4::timestamptz, $4::timestamptz`,
        [ownerIds, externalTargetId, targetId, boundary, userId],
      )
      assert.equal(seededAccounts.rowCount, allAccountIds.length)

      const seededEdges = await write(
        `/* seedExplainOAuthFriendResolutionEdges */
         INSERT INTO ${friends} (id, ${ownerColumn}, ${externalFriendColumn}, ${linkedAccountColumn},
           last_observed_at)
         SELECT id, ($1::uuid[])[((ordinality - 1) % $2::integer + 1)::integer],
           CASE WHEN ordinality <= $2 THEN $3 ELSE $3 || '-elsewhere-' || ordinality END,
           CASE WHEN ordinality > $4::integer + $5::integer AND ordinality <= $2 THEN $6::uuid END,
           CASE WHEN ordinality > $4 AND ordinality <= $4::integer + $5::integer THEN $7::timestamptz
                ELSE $7::timestamptz + (((ordinality + 1) / 2) * INTERVAL '1 minute') END
         FROM unnest($8::uuid[]) WITH ORDINALITY AS edges(id, ordinality)`,
        [
          ownerIds,
          ownerCount,
          externalTargetId,
          eligibleCount,
          staleCount,
          targetId,
          boundary,
          edgeIds,
        ],
      )
      assert.equal(seededEdges.rowCount, totalEdges)
      await write(`/* analyzeExplainOAuthFriendResolution */ ANALYZE ${accounts}, ${friends}`)

      const scenario = `oauth-${provider}-friend-resolution-at-connect-cap`
      registerScenarioContract(scenario, {
        // UPDATE does not RETURN rows. The callback proves its effects.
        allowEmptyResult: true,
        seededRows: { [accounts]: allAccountIds.length, [friends]: totalEdges },
        forbidSequentialScans: [friends],
        expectations: [
          { kind: 'usesIndexes', indexes: [`idx_${friends}__unresolved_reference`], noSort: true },
          { kind: 'queryBinds', token: 'LIMIT', queryContains: updateName },
          { kind: 'maxProcessedRows', relation: accounts, max: 1 },
          {
            kind: 'maxProcessedRows',
            relation: friends,
            max: 2 * connectBatchSize,
            captureIndex: 0,
          },
          { kind: 'maxProcessedRows', relation: friends, max: 1, captureIndex: 1 },
        ],
      })

      const inspect = async (query: TransactionQuery) => {
        const { rows } = await query<{
          id: string
          owner_id: string
          external_id: string
          target_id: string | null
          last_observed_at: Date
        }>(
          `/* inspectExplainOAuthFriendResolution */ SELECT id, ${ownerColumn} AS owner_id,
             ${externalFriendColumn} AS external_id, ${linkedAccountColumn} AS target_id,
             last_observed_at
           FROM ${friends} WHERE ${ownerColumn} = ANY($1::uuid[]) ORDER BY id`,
          [ownerIds],
        )
        return rows
      }

      await runAndCapture(
        scenario,
        async () => {
          await using query = await beginTransaction()
          const before = await inspect(query)
          assert.deepEqual(
            before.map(row => row.id),
            edgeIds,
          )
          assert.deepEqual(
            await resolveFriendReferencePage(query, provider, targetId, connectBatchSize),
            { resolved: connectBatchSize, hasMore: true },
          )
          assert.deepEqual(
            await inspect(query),
            before.map(row => (firstPageIds.has(row.id) ? { ...row, target_id: targetId } : row)),
          )
        },
        undefined,
        [updateName, probeName],
        {
          exactCapturedNames: [inspectName, updateName, probeName, inspectName],
          // EXPLAIN replays the statements independently from the restored fixture.
          // Verify the final drain in the same transaction as its preceding page.
          afterCapture: async () => {
            await using query = await beginTransaction()
            const before = await inspect(query)
            assert.deepEqual(
              await resolveFriendReferencePage(query, provider, targetId, connectBatchSize),
              { resolved: connectBatchSize, hasMore: true },
            )
            assert.deepEqual(
              await resolveFriendReferencePage(query, provider, targetId, connectBatchSize),
              { resolved: 1, hasMore: false },
            )
            assert.deepEqual(
              await inspect(query),
              before.map(row => (eligibleIds.has(row.id) ? { ...row, target_id: targetId } : row)),
            )
          },
        },
      )
    } finally {
      const deletedAccounts = await write(
        `/* cleanupExplainOAuthFriendResolutionAccounts */ DELETE FROM ${accounts} WHERE id = ANY($1::uuid[])`,
        [allAccountIds],
      )
      assert.ok(deletedAccounts.rowCount === allAccountIds.length || deletedAccounts.rowCount === 0)
      const deletedUser = await write(
        '/* cleanupExplainOAuthFriendResolutionUser */ DELETE FROM users WHERE id = $1::uuid',
        [userId],
      )
      assert.equal(deletedUser.rowCount, 1)
    }
  }
}
