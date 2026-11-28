import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { getModeratorWorkload } from '@services/moderation-analytics/moderation-analytics-workload'
import { moderationAnalyticsWorkConfig } from '@services/moderation-analytics/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'

const LEADERBOARD_SIZE = 10
const ACTORS = 60
const COMPLETED_DAYS = 7
const OTHER_COMMUNITIES = 10
const LIVE_INSTANT = new Date('2024-05-22T08:00:00.000Z')
const NOW = new Date('2024-05-22T12:00:00.000Z')
const START = new Date('2024-05-15T00:00:00.000Z')

export async function runModeratorWorkloadCapacity(): Promise<void> {
  const fixture = await seedModeratorWorkload()
  const restore = overrideDynamicConfigFieldsForTest(moderationAnalyticsWorkConfig, {
    leaderboard_page_size: LEADERBOARD_SIZE,
  })
  try {
    await write(`/* analyzeModeratorWorkloadCapacity */
      ANALYZE moderator_actions, moderator_workload_daily_totals, users`)
    const scenario = 'community-moderator-workload-leaderboard-at-cap'
    const queryName = 'getModerationModeratorWorkload'
    const { rows } = await write<{ rollups: number }>(`
      /* countModeratorWorkloadCorpus */
      SELECT count(*)::int AS rollups FROM moderator_workload_daily_totals
    `)
    const corpus = rows[0]!
    registerScenarioContract(scenario, {
      seededRows: { moderator_workload_daily_totals: corpus.rollups },
      forbidSequentialScans: ['moderator_workload_daily_totals', 'moderator_actions'],
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'moderator_workload_daily_totals',
          max: ACTORS * COMPLETED_DAYS,
        },
        { kind: 'maxProcessedRows', relation: 'moderator_actions', max: ACTORS },
        {
          kind: 'usesIndexes',
          indexes: [
            'idx_moderator_workload_daily_totals__community_id_day',
            'idx_moderator_actions__community__id',
          ],
        },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const result = await getModeratorWorkload(
          START,
          { type: 'community', communityId: fixture.communityIds[0]! },
          NOW,
        )
        assert.deepEqual(
          result.moderators.map(row => ({
            id: row.actor_user_id,
            total: row.total,
            counts: row.counts,
          })),
          fixture.expected,
        )
      },
      undefined,
      queryName,
      { exactCapturedNames: [queryName] },
    )
  } finally {
    restore()
    await using cleanup = await beginTransaction()
    await cleanup(sql`/* cleanupModeratorWorkloadCapacityActions */
      DELETE FROM moderator_actions WHERE id = ANY(${fixture.actionIds}::uuid[])`)
    await cleanup(sql`/* cleanupModeratorWorkloadCapacityCommunities */
      DELETE FROM communities WHERE id = ANY(${fixture.communityIds}::uuid[])`)
    await cleanup(sql`/* cleanupModeratorWorkloadCapacityUsers */
      DELETE FROM users WHERE id = ANY(${fixture.actorIds}::uuid[])`)
    await cleanup.commit()
  }
}

async function seedModeratorWorkload() {
  await using query = await beginTransaction()
  const slug = `workload-${randomUUID()}`
  const { rows: communities } = await query<{ id: string }>(sql`
    /* seedModeratorWorkloadCapacityCommunities */
    INSERT INTO communities (name, slug, created_by_id, created_via)
    SELECT 'Explain workload community', ${slug} || '-' || n, ${seedUser.id}, 'system'
    FROM generate_series(0, ${OTHER_COMMUNITIES}) n RETURNING id`)
  const communityIds = communities.map(row => row.id)
  const { rows: actors } = await query<{ id: string }>(sql`
    /* seedModeratorWorkloadCapacityActors */
    INSERT INTO users (username)
    SELECT ${slug} || '-actor-' || n FROM generate_series(1, ${ACTORS}) n RETURNING id`)
  const actorIds = actors.map(row => row.id)
  await query(sql`
    /* seedModeratorWorkloadCapacityDailyTotals */
    INSERT INTO moderator_workload_daily_totals (day, community_id, actor_user_id, action_type, count)
    SELECT day::date, community.id, actor.id, 'warn', (n / 2 + 1)
    FROM unnest(${actorIds}::uuid[]) WITH ORDINALITY actor(id, n)
    CROSS JOIN unnest(${communityIds}::uuid[]) community(id)
    CROSS JOIN generate_series('2024-05-15'::date, '2024-05-21'::date, interval '1 day') days(day)`)
  const actionIds = Array.from({ length: ACTORS * communityIds.length }, (_, i) =>
    seedUuidAtTimestamp(LIVE_INSTANT.getTime(), 90_000 + i),
  )
  await query(sql`
    /* seedModeratorWorkloadCapacityLiveActions */
    INSERT INTO moderator_actions (id, community_id, actor_user_id, target_user_id, action_type, reason)
    SELECT action.id, community.id, actor.id, ${seedUser.id}, 'ban', 'Explain workload action'
    FROM unnest(${actorIds}::uuid[]) WITH ORDINALITY actor(id, member_number)
    CROSS JOIN unnest(${communityIds}::uuid[]) WITH ORDINALITY community(id, community_number)
    JOIN unnest(${actionIds}::uuid[]) WITH ORDINALITY action(id, ordinal)
      ON action.ordinal = (community.community_number - 1) * ${ACTORS} + actor.member_number`)
  await query.commit()
  const expected = actorIds
    .map((id, index) => {
      const warn = 7 * (Math.floor((index + 1) / 2) + 1)
      return { id, total: warn + 1, counts: { ban: 1, warn } }
    })
    .toSorted((a, b) => b.total - a.total || a.id.localeCompare(b.id))
    .slice(0, LEADERBOARD_SIZE)
  return { actorIds, communityIds, actionIds, expected }
}
