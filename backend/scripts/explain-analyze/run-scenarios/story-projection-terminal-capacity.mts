import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import {
  claimStoryPostRelatedUrlProjectionWork,
  hasClaimableStoryPostRelatedUrlProjectionWork,
} from '@services/stories/story-post-related-url-projection-claim'
import { markStoryProjectionLimitReached } from '@services/stories/story-post-related-url-projection-terminal'
import type { ProjectionWork } from '@services/stories/story-post-related-url-projection-types'
import {
  seedProjectionCapacityTerminalJobs,
  cleanupProjectionCapacityTerminalJobs,
} from '../seed-data/story-projection-capacity-terminal.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const CAPACITY = 1000

/** Equal-cap terminal backlog must not be scanned or repeatedly claimed. */
export async function captureStoryProjectionTerminalCapacity(): Promise<void> {
  const previous = relationLimitsConfig.fields.get('post_related_url')
  relationLimitsConfig.fields.set('post_related_url', CAPACITY)
  const fixture = await seedProjectionCapacityTerminalJobs()
  try {
    const cases = [
      ['idle', []],
      ['runnable', [null]],
      ['lower', [999]],
      ['higher', [1001]],
      ['mixed', [null, 999, 1001]],
    ] as const
    for (const [name, capacities] of cases) {
      // no-mistakes-disable-next-line query-reached-per-item: fixed benchmark states reset only three owned queue rows before each capture.
      await resetCandidates(fixture.postIds.slice(0, 3), capacities)
      const id = `post-url-capacity-queue-${name}`
      registerScenarioContract(id, {
        allowEmptyResult: true,
        seededRows: { story_post_related_url_projection_jobs: fixture.postIds.length },
        expectations: [
          // Three bounded lanes, one keyed target read, and the returned UPDATE row.
          { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_jobs', max: 5 },
          { kind: 'custom', name: 'storyProjectionClaimCandidates' },
        ],
      })
      // no-mistakes-disable-next-line query-reached-per-item: five fixed queue states require separate serialized custom/generic production captures.
      await runAndCapture(
        id,
        async () => {
          assert.equal(await hasClaimableStoryPostRelatedUrlProjectionWork(), name !== 'idle')
          const claimed = await claimStoryPostRelatedUrlProjectionWork()
          assert.equal(claimed?.post_id ?? null, name === 'idle' ? null : fixture.postIds[0])
        },
        undefined,
        ['hasClaimableStoryPostRelatedUrlProjection', 'claimStoryPostRelatedUrlProjection'],
        { afterCapture: () => resetCandidates(fixture.postIds.slice(0, 3), capacities) },
      )
    }
    await captureTerminalResult(fixture.postIds[3]!, fixture.postIds.length)
  } finally {
    await cleanupProjectionCapacityTerminalJobs(fixture.storyId)
    if (previous === undefined) relationLimitsConfig.fields.delete('post_related_url')
    else relationLimitsConfig.fields.set('post_related_url', previous)
  }
}

async function resetCandidates(
  postIds: readonly string[],
  capacities: readonly (number | null)[],
): Promise<void> {
  await write(
    `/* resetExplainTerminalCapacityCandidates */
    UPDATE story_post_related_url_projection_jobs
    SET limit_reached_capacity = $2, lease_token = NULL, leased_at = NULL,
      lease_expires_at = NULL, last_claimed_at = NULL
    WHERE post_id = ANY($1::uuid[])`,
    [postIds, CAPACITY],
  )
  if (capacities.length === 0) return
  await write(
    `/* setExplainTerminalCapacityCandidates */
    UPDATE story_post_related_url_projection_jobs work
    SET limit_reached_capacity = input.capacity
    FROM unnest($1::uuid[], $2::integer[]) input(post_id, capacity)
    WHERE work.post_id = input.post_id`,
    [postIds.slice(0, capacities.length), capacities],
  )
}

async function captureTerminalResult(postId: string, count: number): Promise<void> {
  const reset = async () => {
    await write(
      `/* resetExplainTerminalCapacityResult */ UPDATE story_post_related_url_projection_jobs
      SET limit_reached_capacity = NULL, lease_token = post_id, leased_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + INTERVAL '1 day' WHERE post_id = $1`,
      [postId],
    )
  }
  await reset()
  const { rows } = await write<ProjectionWork>(
    `/* getExplainTerminalCapacityWork */
    SELECT post_id, story_id, generation, sweep_upper_bound_source_id,
      sweep_upper_bound_relation_id, relation_snapshot_at, cursor_source_id,
      eligibility_completed_at, source_completed_at, cursor_prune_id,
      limit_reached_capacity, lease_token
    FROM story_post_related_url_projection_jobs WHERE post_id = $1 LIMIT 1`,
    [postId],
  )
  const work = rows[0]!
  const id = 'post-url-capacity-terminal-result'
  registerScenarioContract(id, {
    allowEmptyResult: true,
    seededRows: { story_post_related_url_projection_jobs: count },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_jobs', max: 1 },
    ],
  })
  await runAndCapture(
    id,
    async () => assert.equal(await markStoryProjectionLimitReached(work, CAPACITY), true),
    undefined,
    'markStoryProjectionLimitReached',
    { afterCapture: reset },
  )
}
