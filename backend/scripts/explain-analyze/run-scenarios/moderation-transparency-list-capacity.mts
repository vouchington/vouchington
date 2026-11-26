import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import {
  getCommunityModerationTransparency,
  getModerationTransparency,
  type ModerationTransparency,
} from '@services/moderation-analytics/get-moderation-transparency'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

// The EXPLAIN seed and other scenarios use modern dates in the global rollup table.
const FIRST_DAY = '2010-02-01'
const LAST_DAY = '2012-01-31'
const EXPLICIT_NOW = new Date('2012-02-03T12:00:00.000Z')
const MONTHS_PER_PAGE = 12
const BACKGROUND_COMMUNITIES = 12
const RELEASED_COUNT = 23
const ROUNDED_COUNT = 25

export async function runModerationTransparencyListCapacity(): Promise<void> {
  const scopes = Array.from({ length: BACKGROUND_COMMUNITIES + 1 }, () => randomUUID())
  // Released rows are append-only. This runner goes after other transparency consumers.
  await seedDailyRollups(scopes)
  await write(`/* analyzeModerationTransparencyListCapacity */
    ANALYZE moderation_transparency_released_daily_rollups`)
  await captureTransparency('global')
  await captureTransparency('community', scopes[0]!)
}

async function captureTransparency(scope: 'global' | 'community', communityId?: string) {
  const scenario = `moderation-transparency-${scope}-all-time-at-cap`
  const queryName =
    scope === 'global' ? 'getModerationTransparency' : 'getCommunityModerationTransparency'
  const probeName =
    scope === 'global'
      ? 'hasOlderGlobalModerationTransparencyEvents'
      : 'hasOlderCommunityModerationTransparencyEvents'
  const relation = 'moderation_transparency_released_daily_rollups'
  const pageRows = scope === 'global' ? 682 : 341
  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    expectations: [pageRows, 1, pageRows, 0].map((max, captureIndex) => ({
      kind: 'maxProcessedRows',
      relation,
      max,
      captureIndex,
    })),
  })
  const list = (after?: string) =>
    communityId
      ? getCommunityModerationTransparency(communityId, 'all', EXPLICIT_NOW, after)
      : getModerationTransparency('all', EXPLICIT_NOW, after)
  await runAndCapture(
    scenario,
    async () => {
      const first = await list()
      assert.deepEqual(first.buckets, expectedBuckets(2012, scope))
      assert.ok(first.next_cursor)
      const terminal = await list(first.next_cursor)
      assert.deepEqual(terminal.buckets, expectedBuckets(2011, scope))
      assert.equal(terminal.next_cursor, undefined)
    },
    undefined,
    [queryName, probeName],
    { exactCapturedNames: [queryName, probeName, queryName, probeName] },
  )
}

function expectedBuckets(lastYear: number, scope: 'global' | 'community') {
  return Array.from({ length: MONTHS_PER_PAGE }, (_, offset) => {
    const start = new Date(Date.UTC(lastYear, -offset, 1))
    const daysInMonth = new Date(Date.UTC(lastYear, 1 - offset, 0)).getUTCDate()
    const common = {
      date: start.toISOString().slice(0, 10),
      count: (daysInMonth - 2) * ROUNDED_COUNT,
    }
    const automated = {
      ...common,
      metric: 'automated_moderation' as const,
      category: scope === 'global' ? 'agent_moderation' : 'community_ai',
    }
    return scope === 'global'
      ? [automated, { ...common, metric: 'reports' as const, category: 'spam' }]
      : [automated]
  }).flat() satisfies ModerationTransparency['buckets']
}

async function seedDailyRollups(scopes: string[]) {
  await write(sql`
    /* seedModerationTransparencyListCapacity */
    WITH days AS (
      SELECT day::date AS day
      FROM generate_series(${FIRST_DAY}::date, ${LAST_DAY}::date, interval '1 day') fixture(day)
      -- Boundary-day behavior is tracked by #6573. These pages exercise interior daily cohorts.
      WHERE extract(day FROM day) <> 1 AND extract(day FROM day + interval '1 day') <> 1
    ), dimensions AS (
      SELECT NULL::uuid AS community_id, 'reports'::moderation_transparency_metrics AS metric,
             'spam'::moderation_transparency_categories AS category
      UNION ALL SELECT NULL, 'automated_moderation', 'agent_moderation'
      UNION ALL SELECT community_id, 'automated_moderation', 'community_ai'
        FROM unnest(${scopes}::uuid[]) fixture(community_id)
    )
    INSERT INTO moderation_transparency_released_daily_rollups
      (day, community_id, metric, category, count, latest_occurred_at)
    SELECT day, community_id, metric, category, ${RELEASED_COUNT},
      day::timestamp AT TIME ZONE 'UTC'
    FROM days CROSS JOIN dimensions`)
}
