import assert from 'node:assert/strict'
import { beginTransaction, read } from '@data-stores/psql'
import { setRssFeedStatesAsCurrentUser } from '@services/rss-feeds/set-states-as-current-user'
import type { PrivateUser } from '@services/users/types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const administrator = { ...seedUser, roles: ['administrator'] } as PrivateUser

// Enablement and discoverability change together: one read locks both latest decisions and one
// insert appends both. Only the read has a plan worth gating, since the insert returns no rows.
// The transaction is never committed, so the seeded feed keeps its state.
export async function runRssFeedStateChangeScenarios(): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* explainAnalyzeRun */ SELECT id FROM rss_feeds ORDER BY id LIMIT 1`,
  )
  const rssFeedId = rows[0]?.id
  assert.ok(rssFeedId, 'RSS feed state scenarios require a seeded RSS feed')
  registerScenarioContract('rss-feed-state-changes', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_rss_feed_setting_changes__feed_type_id'],
        queryContains: 'lockLatestRssFeedStates',
      },
      { kind: 'maxProcessedRows', relation: 'rss_feed_setting_changes', max: 3 },
    ],
  })
  await runAndCapture(
    'rss-feed-state-changes',
    async () => {
      await using query = await beginTransaction()
      const result = await setRssFeedStatesAsCurrentUser(
        administrator,
        rssFeedId,
        [
          { kind: 'enablement', is_enabled: false, reason: 'explain scenario' },
          { kind: 'discoverability', is_enabled: false, reason: 'explain scenario' },
        ],
        { query },
      )
      assert.equal(result, 'updated', 'Both seeded decisions must differ from the request')
    },
    undefined,
    'lockLatestRssFeedStates',
  )
}
