import { captureStoryProjectionSafetyLocks } from './story-projection-safety-locks.mts'
import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { getStoryPostRelatedUrlProjectionActiveUrls } from '@services/stories/story-post-related-url-projection-replacement-safety'
import { pruneObsoleteStoryPostRelatedUrlsForReplacement } from '@services/stories/story-post-related-url-projection-replacements'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import type { ProjectionWork } from '@services/stories/story-post-related-url-projection-types'
import { POST_URL_CAPACITY_SEED as seed } from '../seed-data/post-related-url-capacity.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** Safety discovery includes later source pages and stops before any URL lookup. */
export async function captureActivePostUrlSafety(work: ProjectionWork[]): Promise<void> {
  for (const [index, count] of [1000, 10000].entries()) {
    const id = `post-url-active-safety-${count}`
    const postId = work[index]!.post_id
    registerScenarioContract(id, {
      seededRows: { relation__post__related__url: seed.relationRows, urls: 21001 },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'relation__post__related__url', max: count },
        { kind: 'maxProcessedRows', relation: 'urls', max: count },
      ],
    })
    // no-mistakes-disable-next-line query-reached-per-item: two fixed cardinality cases require independent serialized custom/generic captures.
    await runAndCapture(
      id,
      async () => {
        await using query = await beginTransaction()
        const rows = await getStoryPostRelatedUrlProjectionActiveUrls(query, postId)
        assert.equal(rows.length, count)
        assert.equal(new Set(rows.map(row => row.url_id)).size, count)
      },
      undefined,
      'getStoryPostRelatedUrlProjectionActiveUrls',
    )
  }
  await captureStoryProjectionSafetyLocks()
  await captureUnsafeReceiptReplacement(work[2]!)
}

async function captureUnsafeReceiptReplacement(work: ProjectionWork): Promise<void> {
  const id = 'post-url-replacement-unsafe-existing'
  registerScenarioContract(id, {
    allowEmptyResult: true,
    seededRows: {
      relation__post__related__url: seed.relationRows,
      story_post_related_url_projection_jobs: seed.posts.length,
      story_post_related_url_projection_receipts: seed.posts.length,
      story_post_related_url_projection_relation_mutations: 500,
    },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__post__related__url', max: 11 },
      { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_jobs', max: 1 },
      { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_receipts', max: 5 },
      {
        kind: 'maxProcessedRows',
        relation: 'story_post_related_url_projection_relation_mutations',
        max: 5,
      },
    ],
  })
  await runAndCapture(
    id,
    async () => {
      await using query = await beginTransaction()
      await lockPostPublicationPostScopes(query, [work.post_id])
      await pruneObsoleteStoryPostRelatedUrlsForReplacement(query, work, seed.user, [
        seed.activeUrl,
      ])
      const { rows } = await query<{ count: number }>(
        `/* verifyUnsafeReceiptReplacement */ SELECT count(*)::integer AS count
        FROM relation__post__related__url WHERE subject_id = $1 AND deleted_at IS NULL`,
        [work.post_id],
      )
      assert.equal(rows[0]?.count, 0, 'Live unsafe status overrides a stale eligible receipt')
    },
    undefined,
    'pruneObsoleteStoryPostRelatedUrlsForReplacement',
  )
}
