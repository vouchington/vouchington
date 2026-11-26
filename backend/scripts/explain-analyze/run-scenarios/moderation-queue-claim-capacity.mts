import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { CLAIM_EXPIRY_MINUTES } from '@services/moderation-claims/config'
import { attachPostClaims, attachReportClaims } from '@services/moderation-claims/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

type QueueItem = { id: string; community_id: string }

const SCENARIO = 'moderation-queue-claim-sidecars-at-cap'
const PAGE_SIZE = 100
const BACKGROUND_ITEMS = 512
const STATEMENTS = ['attachReportClaims', 'attachPostClaims']

function claimSidecarItems(targetId: string, items: QueueItem[]) {
  const foreground = items.filter(row => row.community_id === targetId).slice(0, PAGE_SIZE)
  const background = items.filter(row => row.community_id !== targetId).slice(0, BACKGROUND_ITEMS)
  assert.equal(foreground.length, PAGE_SIZE)
  assert.equal(background.length, BACKGROUND_ITEMS)
  return { foreground, all: [...foreground, ...background] }
}

async function seedQueueClaims(reportRows: QueueItem[], postRows: QueueItem[]) {
  const { rows } = await write<{
    id: string
    item_id: string
    ordinal: number
    generation: number
  }>(
    `/* seedModerationQueueClaimCapacity */
    WITH targets AS (
      SELECT item_id, scope_id, n, true AS is_report
      FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS reports(item_id, scope_id, n)
      UNION ALL
      SELECT item_id, scope_id, n, false
      FROM unnest($3::uuid[], $4::uuid[]) WITH ORDINALITY AS posts(item_id, scope_id, n)
    ), fixture AS MATERIALIZED (
      SELECT uuidv7() AS id, item_id, scope_id, n, is_report, generation
      FROM targets CROSS JOIN LATERAL generate_series(1, CASE WHEN n <= $6 THEN 3 ELSE 1 END) generation
      WHERE n > $6 OR generation < 3 OR n % 4 < 2
    ), claims AS (
      INSERT INTO moderation_queue_claims (id, community_id, report_id, post_id, claimed_by_id, claimed_at, released_at)
      SELECT id, scope_id, CASE WHEN is_report THEN item_id END, CASE WHEN NOT is_report THEN item_id END,
        $5, CASE WHEN generation = 3 AND n % 4 = 1
          THEN CURRENT_TIMESTAMP - ($7::int + 1) * interval '1 minute' ELSE CURRENT_TIMESTAMP END,
        CASE WHEN n <= $6 AND generation < 3 THEN CURRENT_TIMESTAMP END
      FROM fixture RETURNING id
    )
    SELECT claims.id, fixture.item_id, fixture.n::int AS ordinal, fixture.generation
    FROM claims JOIN fixture USING (id)`,
    [
      reportRows.map(row => row.id),
      reportRows.map(row => row.community_id),
      postRows.map(row => row.id),
      postRows.map(row => row.community_id),
      seedUser.id,
      PAGE_SIZE,
      CLAIM_EXPIRY_MINUTES,
    ],
  )
  return rows
}

export async function runModerationQueueClaimCapacity(
  communityId: string,
  reportRows: QueueItem[],
  postRows: QueueItem[],
): Promise<void> {
  const reports = claimSidecarItems(communityId, reportRows)
  const posts = claimSidecarItems(communityId, postRows)
  const seeded = await seedQueueClaims(reports.all, posts.all)
  const liveClaims = new Map(
    seeded
      .filter(row => row.generation === 3 && row.ordinal % 4 === 0)
      .map(row => [row.item_id, row.id]),
  )
  assert.equal(liveClaims.size, PAGE_SIZE / 2)
  registerScenarioContract(SCENARIO, {
    seededRows: { moderation_queue_claims: seeded.length },
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['uq_moderation_queue_claims__active_report'],
        queryContains: 'attachReportClaims',
        noSort: true,
      },
      {
        kind: 'usesIndexes',
        indexes: ['uq_moderation_queue_claims__active_post'],
        queryContains: 'attachPostClaims',
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'moderation_queue_claims', max: PAGE_SIZE / 2 },
    ],
  })
  await runAndCapture(
    SCENARIO,
    async () => {
      const reportBatch = reports.foreground.map(({ id }) => ({ id }))
      const postBatch = posts.foreground.map(({ id }) => ({ id }))
      const reportClaims = await attachReportClaims(reportBatch)
      const postClaims = await attachPostClaims(postBatch)
      assert.deepEqual(
        reportClaims.map(({ id, claim }) => [id, claim?.id ?? null]),
        reportBatch.map(({ id }) => [id, liveClaims.get(id) ?? null]),
      )
      assert.deepEqual(
        postClaims.map(({ id, claim }) => [id, claim?.id ?? null]),
        postBatch.map(({ id }) => [id, liveClaims.get(id) ?? null]),
      )
    },
    undefined,
    STATEMENTS,
    { exactCapturedNames: STATEMENTS },
  )
}
