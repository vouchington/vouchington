import assert from 'node:assert/strict'
import { getCapturedQueries, read } from '@data-stores/psql'
import { getMinUUIDv7ForParentHistory } from '@modules/utils/ids'
import { assertNoRecentDistribution } from '@services/follower-distributions/create-guards'
import { hasPostCreationModerationBypass } from '@services/posts/create/moderation-bypass'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId, seedUser } from '../run-support.mts'

export async function runFollowerDistributionScenarios(): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* explainAnalyzeRun */ SELECT id FROM rss_feed_items ORDER BY id LIMIT 1`,
  )
  const itemId = rows[0]?.id
  assert.ok(itemId, 'Follower distribution scenarios require seeded RSS items')
  const actions = ['post_share', 'post_send', 'rss_feed_item_share', 'rss_feed_item_send'] as const
  for (const action of actions) {
    const id = `follower-distribution-rate-limit-${action}`
    registerScenarioContract(id, {
      expectations: [
        { kind: 'queryBinds', token: 'sender_user_id' },
        { kind: 'queryBinds', token: 'follower_distribution_deliveries' },
        { kind: 'maxProcessedRows', relation: 'follower_distributions', max: 4 },
        { kind: 'maxProcessedRows', relation: 'follower_distribution_deliveries', max: 4 },
      ],
    })
    await runAndCapture(id, async () => {
      await assert.rejects(
        assertNoRecentDistribution(
          seedUser.id,
          action,
          action.startsWith('post_') ? seedPostId : itemId,
          read,
        ),
        { statusCode: 429 },
      )
    })
  }
  registerScenarioContract('post-creation-moderation-bypass', {
    expectations: [
      { kind: 'custom', name: 'parentHistoryLowerBound' },
      { kind: 'maxProcessedRows', relation: 'post_clearance_changes', max: 10 },
    ],
    crossPartition: {
      post_clearance_changes:
        'A parent lower bound skips older history but permits later changes across future ranges.',
    },
  })
  await runAndCapture('post-creation-moderation-bypass', async () => {
    assert.equal(
      await hasPostCreationModerationBypass(seedPostId),
      true,
      'The parent-history query must read its seeded bypass decision',
    )
  })
  const captured = getCapturedQueries().find(query =>
    query.text.includes('hasPostCreationModerationBypass'),
  )
  const bound = captured?.text.match(/\bid\s*>=\s*\$(\d+)::uuid/u)
  assert.ok(captured && bound, 'Moderation bypass must bind its parent-history lower bound')
  assert.equal(captured.values[Number(bound[1]) - 1], getMinUUIDv7ForParentHistory(seedPostId))
}
