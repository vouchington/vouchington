import { beginTransaction, write } from '@data-stores/psql'
import { repairOAuthFriendEdgePage } from '@services/data-retention/cleanup-oauth-friend-repair'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { v7 } from 'uuid'
import { DEFAULT_DATA_RETENTION_CONFIG } from '@services/data-retention/config'
import { runOAuthFriendRepairStatusScenarios } from './oauth-friend-repair-status.mts'

export async function runOAuthFriendRepairScenario(): Promise<void> {
  const edgePrefix = v7().slice(0, -4)
  const startId = `${edgePrefix}0000`
  const edgeId = `${edgePrefix}0001`
  const batchSize = DEFAULT_DATA_RETENTION_CONFIG.batch_size
  const noiseIds = Array.from(
    { length: batchSize - 1 },
    (_, index) => `${edgePrefix}${(index + 2).toString(16).padStart(4, '0')}`,
  )
  const targetProviderId = `explain-repair-${crypto.randomUUID()}`
  const { rows: accounts } = await write<{ id: string }>(
    `/* seedExplainFriendRepairTarget */ INSERT INTO facebook_accounts (user_id, facebook_user_id, facebook_user_data)
     VALUES ($1::uuid, $2, '{}'::jsonb) RETURNING id`,
    [seedUuid(4, '01'), targetProviderId],
  )
  const { rows } = await write<{ edge_id: string }>(
    `/* seedExplainFriendRepairEdge */ INSERT INTO facebook_friends (id, facebook_account_id, facebook_friend_id)
     SELECT $2::uuid, id, $1 FROM facebook_accounts WHERE facebook_user_id = 'seed-fb-user-0'
     RETURNING id AS edge_id`,
    [targetProviderId, edgeId],
  )
  if (!rows[0]) throw new Error('Expected seeded Facebook source')
  const edge = rows[0]
  registerScenarioContract('oauth-friend-unresolved-repair', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'facebook_friends', max: 8 },
      { kind: 'maxProcessedRows', relation: 'facebook_accounts', max: 4 },
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
    ],
  })
  try {
    await runAndCapture(
      'oauth-friend-unresolved-repair',
      async () => {
        await using query = await beginTransaction()
        const page = await repairOAuthFriendEdgePage(query, 'facebook', 4, startId, edge.edge_id)
        if (page.scanned !== 1 || page.resolved !== 1)
          throw new Error('Expected one resolved repair fixture')
        await query.commit()
      },
      undefined,
      [
        'scanOAuthFriendEdgeRepairPage',
        'eraseStaleOAuthFriendRepairPage',
        'resolveOAuthFriendRepairPage',
      ],
      {
        afterCapture: async () => {
          await write(
            '/* resetExplainFriendRepairEdge */ UPDATE facebook_friends SET friend_facebook_account_id = NULL WHERE id = $1::uuid',
            [edge.edge_id],
          )
        },
      },
    )
    await write(
      `/* seedExplainFriendRepairBatch */ INSERT INTO facebook_friends (id, facebook_account_id, facebook_friend_id)
       SELECT item.id, source.id, $2 || '-batch-' || item.ordinal
       FROM unnest($1::uuid[]) WITH ORDINALITY AS item(id, ordinal)
       CROSS JOIN facebook_accounts source WHERE source.facebook_user_id = 'seed-fb-user-0'`,
      [noiseIds, targetProviderId],
    )
    registerScenarioContract('oauth-friend-repair-batch', {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'facebook_friends', max: 4 * batchSize },
        { kind: 'maxProcessedRows', relation: 'facebook_accounts', max: 2 * batchSize + 4 },
        { kind: 'maxProcessedRows', relation: 'users', max: 2 * batchSize + 4 },
      ],
    })
    await runAndCapture(
      'oauth-friend-repair-batch',
      async () => {
        await using query = await beginTransaction()
        const page = await repairOAuthFriendEdgePage(
          query,
          'facebook',
          batchSize,
          startId,
          noiseIds.at(-1)!,
        )
        if (page.scanned !== batchSize || page.resolved !== 1 || page.deleted !== 0)
          throw new Error('Expected a full page with one resolvable repair fixture')
        await query.commit()
      },
      undefined,
      [
        'scanOAuthFriendEdgeRepairPage',
        'eraseStaleOAuthFriendRepairPage',
        'resolveOAuthFriendRepairPage',
      ],
      {
        afterCapture: async () => {
          await write(
            '/* resetExplainFriendRepairBatch */ UPDATE facebook_friends SET friend_facebook_account_id = NULL WHERE id = $1::uuid',
            [edge.edge_id],
          )
        },
      },
    )
    await runOAuthFriendRepairStatusScenarios(noiseIds.at(-1)!)
  } finally {
    await write(
      '/* cleanupExplainFriendRepairEdge */ DELETE FROM facebook_friends WHERE id = ANY($1::uuid[])',
      [[edge.edge_id, ...noiseIds]],
    )
    await write(
      '/* cleanupExplainFriendRepairTarget */ DELETE FROM facebook_accounts WHERE id = $1::uuid',
      [accounts[0]!.id],
    )
  }
}
