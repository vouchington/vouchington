import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import {
  createModerationSummaryCollection,
  createModerationSummaryScan,
} from '@queues/background/enqueues/moderation-summary-state'
import { runModerationSummaryStage } from '@services/communities/moderation-summary-stages'
import { MODERATION_SUMMARY_EVASION_RANK_MAX } from '@services/communities/moderation-summary-work'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

export async function runModerationDigestEvasionCapacity(): Promise<void> {
  const tag = `explain-evasion-${randomUUID()}`
  const communityIds = [randomUUID(), randomUUID()]
  try {
    await write(
      `/* seedModerationDigestEvasionCommunities */
      INSERT INTO communities (id, name, slug, created_by_id, created_via)
      SELECT id, $2, $2 || '-' || n, $3, 'system'
      FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, n)`,
      [communityIds, tag, seedUser.id],
    )
    await write(
      `/* seedModerationDigestEvasionMembers */
      INSERT INTO community_members (community_id, user_id, suspected_ban_evader_at,
        suspected_ban_evader_source_user_id, suspected_ban_evader_score,
        suspected_ban_evader_dismissed_at, removed_at)
      SELECT fixture.id, u.id, CURRENT_TIMESTAMP, $3, 0.9,
        CASE WHEN n = CASE WHEN fixture.ordinal = 1 THEN $2 + 1 ELSE 3 END THEN CURRENT_TIMESTAMP END,
        CASE WHEN n = CASE WHEN fixture.ordinal = 1 THEN $2 + 2 ELSE 4 END THEN CURRENT_TIMESTAMP END
      FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)
      CROSS JOIN LATERAL (
        SELECT id, row_number() OVER (ORDER BY id) AS n
        FROM users WHERE username BETWEEN 'seeduser1000' AND 'seeduser9999'
        ORDER BY id LIMIT CASE WHEN fixture.ordinal = 1 THEN $2 + 50 ELSE 4 END
      ) u`,
      [communityIds, MODERATION_SUMMARY_EVASION_RANK_MAX, seedUser.id],
    )
    const scenario = 'moderation-digest-evasion-rank-at-cap'
    const query = 'countModerationSummaryEvaders'
    registerScenarioContract(scenario, {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_community_members__suspected_evasion'],
          noSort: true,
        },
        {
          kind: 'maxProcessedRows',
          relation: 'community_members',
          max: MODERATION_SUMMARY_EVASION_RANK_MAX,
          captureIndex: 0,
        },
        { kind: 'maxProcessedRows', relation: 'community_members', max: 2, captureIndex: 1 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const now = new Date()
        for (const [communityId, expected] of [
          [communityIds[0]!, MODERATION_SUMMARY_EVASION_RANK_MAX],
          [communityIds[1]!, 2],
        ] as const) {
          const result = await runModerationSummaryStage('evaders', {
            userId: seedUser.id,
            windowStart: now,
            windowEnd: now,
            eligibilityAt: now,
            collection: {
              ...createModerationSummaryCollection(),
              scan: createModerationSummaryScan(communityId),
            },
            communities: [],
          })
          assert.equal(result.next, 'memberships')
          assert.equal(result.collection.scan, null)
          assert.deepEqual(
            result.collection.top.map(row => [row.communityId, row.metrics.suspected_ban_evaders]),
            [[communityId, expected]],
          )
        }
      },
      undefined,
      query,
      { exactCapturedNames: [query, query] },
    )
  } finally {
    await write(
      '/* cleanupModerationDigestEvasion */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
      [communityIds],
    )
  }
}
