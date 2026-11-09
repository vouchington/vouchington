import assert from 'node:assert/strict'
import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import {
  claimStoryPostRelatedUrlProjectionWork,
  hasClaimableStoryPostRelatedUrlProjectionWork,
  releaseStoryPostRelatedUrlProjectionWork,
} from '@services/stories/story-post-related-url-projection-work'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const storyId = v7()
const postId = v7()
const storyTitle = `EXPLAIN scoped story URL work ${storyId}`

/** Captures the post-keyed claim and remaining-work probes against a noisy work table. */
export async function runStoryPostUrlScopedWorkScenarios(): Promise<void> {
  await seedScopedStoryPostUrlWork()
  try {
    await write(
      '/* analyzeStoryPostUrlScopedWork */ ANALYZE story_post_related_url_projection_jobs',
    )
    registerScenarioContract('story-post-url-scoped-work', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['story_post_related_url_projection_jobs_pkey'],
        },
        {
          kind: 'maxProcessedRows',
          relation: 'story_post_related_url_projection_jobs',
          max: 4,
        },
      ],
      seededRows: { story_post_related_url_projection_jobs: 2_001 },
    })
    let claimedWork: Awaited<ReturnType<typeof claimStoryPostRelatedUrlProjectionWork>> = null
    await runAndCapture(
      'story-post-url-scoped-work',
      async () => {
        const scope = { postIds: [postId] }
        assert.equal(await hasClaimableStoryPostRelatedUrlProjectionWork(scope), true)
        claimedWork = await claimStoryPostRelatedUrlProjectionWork(scope)
        assert.equal(claimedWork?.post_id, postId)
      },
      undefined,
      [
        'hasClaimableStoryPostRelatedUrlProjection:scoped',
        'claimStoryPostRelatedUrlProjection:scoped',
      ],
      {
        afterCapture: async () => {
          if (claimedWork) await releaseStoryPostRelatedUrlProjectionWork(claimedWork)
        },
      },
    )
  } finally {
    await removeScopedStoryPostUrlWork()
  }
}

async function seedScopedStoryPostUrlWork(): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* seedStoryPostUrlScopedWork:story */ INSERT INTO stories (id, title)
     VALUES ($1, $2)`,
    [storyId, storyTitle],
  )
  await query(
    `/* seedStoryPostUrlScopedWork:post */ INSERT INTO posts
       (id, created_by_id, post_type, title, markdown, created_via,
        bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
     VALUES ($1, $2, 'discussion', 'Scoped projection work', '', 'system',
       decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex'))`,
    [postId, seedUser.id],
  )
  await query(
    `/* seedStoryPostUrlScopedWork:noise */ INSERT INTO story_post_related_url_projection_jobs
       (post_id, story_id)
     SELECT posts.id, $1::uuid
     FROM posts
     WHERE posts.id <> $2::uuid
     ORDER BY posts.id
     LIMIT 2000
     ON CONFLICT (post_id) DO NOTHING`,
    [storyId, postId],
  )
  await query(
    `/* seedStoryPostUrlScopedWork:target */ INSERT INTO story_post_related_url_projection_jobs
       (post_id, story_id)
     VALUES ($1, $2)`,
    [postId, storyId],
  )
  await query.commit()
}

async function removeScopedStoryPostUrlWork(): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* cleanupStoryPostUrlScopedWork:jobs */ DELETE FROM story_post_related_url_projection_jobs
     WHERE story_id = $1`,
    [storyId],
  )
  await query(`/* cleanupStoryPostUrlScopedWork:post */ DELETE FROM posts WHERE id = $1`, [postId])
  await query(`/* cleanupStoryPostUrlScopedWork:story */ DELETE FROM stories WHERE id = $1`, [
    storyId,
  ])
  await query.commit()
}
