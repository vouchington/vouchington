import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import {
  claimStoryPostRelatedUrlProjectionWork,
  releaseStoryPostRelatedUrlProjectionWork,
} from '@services/stories/story-post-related-url-projection-work'
import { reconcileStoryPostRelatedUrlProjection } from '@services/stories/story-post-related-url-projection'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  seedStoryProjectionDispatcherWitness,
  removeStoryProjectionDispatcherWitness,
} from '../seed-data/story-post-related-url-projection.mts'

/** Mutating behavioral witness: run once, outside EXPLAIN's captured statement replay. */
export async function runStoryProjectionWorkScenarios(): Promise<void> {
  console.log('Running: story-projection-global-dispatcher')
  const fixture = await seedStoryProjectionDispatcherWitness()
  const [firstId, secondId, activeId] = fixture.postIds
  try {
    const first = await claimStoryPostRelatedUrlProjectionWork()
    assert.equal(first?.post_id, firstId, 'Global claim starts with the oldest unclaimed id')
    assert.ok(first)
    await releaseStoryPostRelatedUrlProjectionWork(first)
    const second = await claimStoryPostRelatedUrlProjectionWork()
    assert.equal(second?.post_id, secondId, 'Released work rotates behind never-claimed work')
    assert.ok(second)
    await releaseStoryPostRelatedUrlProjectionWork(second)
    const rotated = await claimStoryPostRelatedUrlProjectionWork()
    assert.equal(rotated?.post_id, firstId, 'Rotation returns to the least recently claimed work')
    assert.ok(rotated)
    const heldSecond = await claimStoryPostRelatedUrlProjectionWork()
    assert.equal(heldSecond?.post_id, secondId)
    assert.ok(heldSecond)
    assert.equal(
      await claimStoryPostRelatedUrlProjectionWork(),
      null,
      'All active leases are excluded',
    )
    const expired = await write<{ lease_token: string }>(
      `/* storyProjectionDispatcherWitness */ UPDATE story_post_related_url_projection_jobs
        SET lease_expires_at = clock_timestamp() - INTERVAL '1 second'
        WHERE post_id = $1 RETURNING lease_token`,
      [activeId],
    )
    const reclaimed = await claimStoryPostRelatedUrlProjectionWork()
    assert.equal(reclaimed?.post_id, activeId, 'An expired lease becomes globally claimable')
    assert.ok(reclaimed)
    assert.notEqual(reclaimed.lease_token, expired.rows[0]!.lease_token)
    await releaseStoryPostRelatedUrlProjectionWork(reclaimed)
    await releaseStoryPostRelatedUrlProjectionWork(rotated)
    await releaseStoryPostRelatedUrlProjectionWork(heldSecond)

    // NULL source/relation high-water marks are genuine empty snapshots, not skipped effects.
    assert.deepEqual(await reconcileStoryPostRelatedUrlProjection(), {
      processed: 0,
      continue: true,
    })
    assert.deepEqual(await reconcileStoryPostRelatedUrlProjection(), {
      processed: 0,
      continue: true,
    })
    assert.deepEqual(await reconcileStoryPostRelatedUrlProjection(), {
      processed: 0,
      continue: true,
    })
    assert.deepEqual(await reconcileStoryPostRelatedUrlProjection(), {
      processed: 0,
      continue: true,
    })
    const remaining2 = await write<{ count: string }>(
      `/* storyProjectionDispatcherWitness */ SELECT COUNT(*)::text AS count
        FROM story_post_related_url_projection_jobs`,
    )
    assert.equal(Number(remaining2.rows[0]!.count), 2)
    assert.deepEqual(await reconcileStoryPostRelatedUrlProjection(), {
      processed: 0,
      continue: true,
    })
    const remaining1 = await write<{ count: string }>(
      `/* storyProjectionDispatcherWitness */ SELECT COUNT(*)::text AS count
        FROM story_post_related_url_projection_jobs`,
    )
    assert.equal(Number(remaining1.rows[0]!.count), 1)
    assert.deepEqual(await reconcileStoryPostRelatedUrlProjection(), {
      processed: 0,
      continue: false,
    })
    const remaining0 = await write<{ count: string }>(
      `/* storyProjectionDispatcherWitness */ SELECT COUNT(*)::text AS count
        FROM story_post_related_url_projection_jobs`,
    )
    assert.equal(Number(remaining0.rows[0]!.count), 0)
    assert.deepEqual(await reconcileStoryPostRelatedUrlProjection(), {
      processed: 0,
      continue: false,
    })
  } finally {
    await removeStoryProjectionDispatcherWitness(fixture)
  }

  const { rows: planStories } = await write<{ id: string }>(
    `/* seedStoryProjectionClaimPlan:story */ INSERT INTO stories (title)
     VALUES ('EXPLAIN global claim') RETURNING id`,
  )
  const planStoryId = planStories[0]!.id
  try {
    await write(
      `/* seedStoryProjectionClaimPlan:jobs */
       INSERT INTO story_post_related_url_projection_jobs
         (post_id, story_id, lease_token, leased_at, lease_expires_at, last_claimed_at)
       SELECT id, $1::uuid,
         CASE WHEN ordinal <= 1900 THEN uuidv7() END,
         CASE WHEN ordinal <= 1900 THEN NOW() END,
         CASE WHEN ordinal <= 1900 THEN NOW() + INTERVAL '1 day' END,
         CASE WHEN ordinal <= 1900 THEN NOW() - INTERVAL '1 hour' END
       FROM (SELECT id, row_number() OVER (ORDER BY id) AS ordinal
             FROM posts ORDER BY id LIMIT 2000) candidates`,
      [planStoryId],
    )
    await write(
      `/* seedStoryProjectionClaimPlan:analyze */ ANALYZE story_post_related_url_projection_jobs`,
    )
    registerScenarioContract('story-projection-global-claim', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_story_post_relate_url_project_jobs__last_claimed_at_post_id'],
          noSort: true,
        },
        { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_jobs', max: 4 },
      ],
      seededRows: { story_post_related_url_projection_jobs: 2000 },
    })
    await runAndCapture(
      'story-projection-global-claim',
      claimStoryPostRelatedUrlProjectionWork,
      undefined,
      'claimStoryPostRelatedUrlProjection',
    )
  } finally {
    await write(
      `/* seedStoryProjectionClaimPlan:removeJobs */
       DELETE FROM story_post_related_url_projection_jobs WHERE story_id = $1::uuid`,
      [planStoryId],
    )
    await write(
      `/* seedStoryProjectionClaimPlan:removeStory */ DELETE FROM stories WHERE id = $1::uuid`,
      [planStoryId],
    )
  }
}
