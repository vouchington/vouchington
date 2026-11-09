import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { repairOAuthFriendEdgesInTransaction } from '@services/data-retention/cleanup-oauth-friend-repair'
import {
  hasPendingOAuthFriendEdgeWork,
  providers,
} from '@services/data-retention/cleanup-oauth-friend-pending'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

type SavedCursor = {
  cursor_edge_id: string | null
  cursor_upper_edge_id: string | null
}

/** Capture cursor completion and pending probes while restoring the pre-existing checkpoint. */
export async function runOAuthFriendRepairStatusScenarios(end: string): Promise<void> {
  const { rows } = await write<SavedCursor>(
    `/* saveExplainFriendRepairCursor */ SELECT cursor_edge_id, cursor_upper_edge_id
     FROM oauth_friend_reference_repair_cursors WHERE provider = 'facebook'`,
  )
  const previous = rows[0]
  try {
    await write(
      `/* seedExplainFriendRepairCursor */ INSERT INTO oauth_friend_reference_repair_cursors
       (provider, cursor_edge_id, cursor_upper_edge_id) VALUES ('facebook', NULL, NULL)
       ON CONFLICT (provider) DO UPDATE SET cursor_edge_id = NULL, cursor_upper_edge_id = NULL`,
    )
    registerScenarioContract('oauth-friend-repair-cursor', {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'facebook_friends', max: 4 },
        { kind: 'maxProcessedRows', relation: 'oauth_friend_reference_repair_cursors', max: 4 },
      ],
    })
    await runAndCapture(
      'oauth-friend-repair-cursor',
      async () => {
        await using query = await beginTransaction()
        const page = await repairOAuthFriendEdgesInTransaction(query, 'facebook', 1)
        if (!page.worked || !page.hasMore) throw new Error('Expected an unfinished repair page')
        await query.rollback()
      },
      undefined,
      [
        'initializeOAuthFriendRepairCursor',
        'lockOAuthFriendRepairCursor',
        'findOAuthFriendRepairSweepEnd',
        'advanceOAuthFriendRepairCursor',
      ],
    )
    await write(
      `/* seedExplainFriendRepairComplete */ INSERT INTO oauth_friend_reference_repair_cursors
       (provider, cursor_edge_id, cursor_upper_edge_id) VALUES ('facebook', $1::uuid, $1::uuid)
       ON CONFLICT (provider) DO UPDATE SET cursor_edge_id = EXCLUDED.cursor_edge_id,
         cursor_upper_edge_id = EXCLUDED.cursor_upper_edge_id`,
      [end],
    )
    registerScenarioContract('oauth-friend-repair-complete', {
      allowEmptyResult: true,
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'oauth_friend_reference_repair_cursors',
          max: providers.length + 1,
        },
      ],
    })
    await runAndCapture(
      'oauth-friend-repair-complete',
      async () => {
        await using query = await beginTransaction()
        const result = await repairOAuthFriendEdgesInTransaction(query, 'facebook', 1)
        assert.deepEqual(result, { worked: false, deleted: 0, resolved: 0, hasMore: false })
        await query.rollback()
      },
      undefined,
      'clearOAuthFriendRepairCursor',
    )

    registerScenarioContract('oauth-friend-repair-pending', {
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'oauth_friend_reference_repair_cursors',
          max: providers.length + 1,
        },
        { kind: 'maxProcessedRows', relation: 'facebook_accounts', max: 4 },
        { kind: 'maxProcessedRows', relation: 'github_accounts', max: 4 },
        { kind: 'maxProcessedRows', relation: 'x_accounts', max: 4 },
      ],
    })
    await runAndCapture(
      'oauth-friend-repair-pending',
      async () => {
        const now = new Date()
        assert.equal(
          await hasPendingOAuthFriendEdgeWork(now, { provider: 'facebook', phase: 'repair' }),
          true,
        )
        assert.equal(await hasPendingOAuthFriendEdgeWork(now), true)
      },
      undefined,
      'hasPendingOAuthFriendEdgeWork',
    )
  } finally {
    await write(
      `/* clearExplainFriendRepairStatus */ DELETE FROM oauth_friend_reference_repair_cursors WHERE provider = 'facebook'`,
    )
    if (previous) {
      await write(
        `/* restoreExplainFriendRepairCursor */ INSERT INTO oauth_friend_reference_repair_cursors
         (provider, cursor_edge_id, cursor_upper_edge_id)
         VALUES ('facebook', $1::uuid, $2::uuid)`,
        [previous.cursor_edge_id, previous.cursor_upper_edge_id],
      )
    }
  }
}
