import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { insertImageUploadRecord } from '@services/images/create-upload-url'
import {
  claimImageUpload,
  persistPromotedImageKey,
  markImageUploadSourceDeleted,
} from '@services/images/complete-upload-state'
import { insertStoryPostRecord } from '@services/posts/create-story-post'
import { createPostStory } from '@services/stories/update'
import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runContentAuthoritySnapshotScenarios(): Promise<void> {
  const imageId = randomUUID()
  const sha = Buffer.alloc(32, 1)
  const story = await write<{ id: string }>(
    `/* seedContentAuthorityStory */ INSERT INTO stories (title) VALUES ('Authority snapshot') RETURNING id`,
  )
  const storyId = story.rows[0]!.id
  const author = await write<{ id: string }>(
    `/* findContentAuthorityAuthor */ SELECT id FROM users WHERE username = 'story-teller' AND deleted_at IS NULL`,
  )
  if (!author.rows[0]) throw new Error('Expected the canonical story-teller system user')
  const authorId = author.rows[0].id
  let postId = ''
  try {
    registerScenarioContract('image-upload-owner-snapshot', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'users', max: 2 },
        { kind: 'maxProcessedRows', relation: 'images', max: 4 },
      ],
    })
    await runAndCapture(
      'image-upload-owner-snapshot',
      async () => {
        await using query = await beginTransaction()
        await insertImageUploadRecord(query, seedUser.id, imageId)
        await query.rollback()
      },
      undefined,
      'createImageUploadUrl',
    )
    await write(
      `/* seedContentAuthorityImage */ INSERT INTO images
      (id, created_by_id, s3_key, data, upload_staged_at) VALUES ($1::uuid, $2::uuid, $1::text, '{}', now())`,
      [imageId, seedUser.id],
    )
    registerScenarioContract('image-claim-owner-snapshot', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'users', max: 2 },
        { kind: 'maxProcessedRows', relation: 'images', max: 4 },
      ],
    })
    await runAndCapture(
      'image-claim-owner-snapshot',
      () => claimImageUpload(seedUser.id, imageId),
      undefined,
      ['assertActiveUploadUser', 'claimImageUpload:read', 'claimImageUpload:update'],
      {
        afterCapture: async () => {
          await write(
            '/* resetContentAuthorityClaim */ UPDATE images SET upload_started_at = NULL WHERE id = $1',
            [imageId],
          )
        },
      },
    )
    await write(
      '/* seedContentAuthorityPromotion */ UPDATE images SET upload_started_at = now(), sha_256 = $2 WHERE id = $1',
      [imageId, sha],
    )
    registerScenarioContract('image-promotion-owner-snapshot', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'users', max: 2 },
        { kind: 'maxProcessedRows', relation: 'images', max: 4 },
      ],
    })
    await runAndCapture(
      'image-promotion-owner-snapshot',
      () => persistPromotedImageKey(imageId, sha, 'promoted-authority'),
      undefined,
      [
        'persistPromotedImageKey:creator',
        'assertActiveUploadUser',
        'persistPromotedImageKey:update',
      ],
    )
    registerScenarioContract('image-source-written-rows', {
      allowEmptyResult: true,
      expectations: [{ kind: 'maxProcessedRows', relation: 'images', max: 4 }],
    })
    await runAndCapture(
      'image-source-written-rows',
      () => markImageUploadSourceDeleted(imageId),
      undefined,
      ['markImageUploadSourcesDeleted:lock', 'markImageUploadSourcesDeleted:update'],
      {
        afterCapture: async () => {
          await write(
            '/* resetContentAuthoritySource */ UPDATE images SET upload_source_deleted_at = NULL WHERE id = $1',
            [imageId],
          )
        },
      },
    )
    registerScenarioContract('story-post-author-snapshot', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'users', max: 2 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 2 },
      ],
    })
    const input = {
      title: 'Authority snapshot',
      aiSummaryMarkdown: '',
      createdById: authorId,
      embeddingContentSha: sha,
      moderationContentSha: sha,
    }
    await runAndCapture(
      'story-post-author-snapshot',
      async () => {
        await using query = await beginTransaction()
        await insertStoryPostRecord(input, { query })
        await query.rollback()
      },
      undefined,
      'insertStoryPostRecord',
    )
    await using fixtureQuery = await beginTransaction()
    const post = await insertStoryPostRecord(input, { query: fixtureQuery })
    postId = post.id
    await fixtureQuery.commit()
    registerScenarioContract('story-post-parent-snapshot', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'stories', max: 2 },
        { kind: 'maxProcessedRows', relation: 'story_posts', max: 2 },
      ],
    })
    await runAndCapture(
      'story-post-parent-snapshot',
      async () => {
        await using query = await beginTransaction()
        await createPostStory(postId, storyId, seedUser.id, { query })
        await query.rollback()
      },
      undefined,
      'createPostStory',
    )
  } finally {
    if (postId)
      await write('/* cleanupContentAuthorityPost */ DELETE FROM posts WHERE id = $1', [postId])
    await write('/* cleanupContentAuthorityStory */ DELETE FROM stories WHERE id = $1', [storyId])
    await write('/* cleanupContentAuthorityImage */ DELETE FROM images WHERE id = $1', [imageId])
  }
}
