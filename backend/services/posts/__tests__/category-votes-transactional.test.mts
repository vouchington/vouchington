import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  getEntityRelation,
  getLatestTestEntityRelationVoteScore,
  getPostHashtagSourcesForTest,
  getTopicAliasIdForTest,
  insertTestCard,
  createTestPost,
  readAllQueueJobs,
  softDeleteUser,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { notifications } from '@queues/notifications/queues'
import { createPost } from '../create.mts'
import { updatePost } from '../update.mts'
import { syncPostHashtagCategoriesInTransaction } from '../hashtags.mts'
import { castPostCategoryVotesInTransaction } from '../hashtag-votes.mts'

describe('transactional post category votes', () => {
  it('attributes hashtag votes to the editor and neutralizes removed soft-deleted relations', async () => {
    const owner = await createTestUser()
    const editor = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const post = await createPost(owner, { title: `No category ${suffix}` })
    const tag = `editor-${suffix}`

    await updatePost(editor, post!, { title: `Edited #${tag} ${suffix}` })
    const aliasId = await getTopicAliasIdForTest(tag)
    expect(aliasId).toBeTruthy()
    const relation = (
      await getEntityRelation('relation__post__category__topic_alias', post!.id, aliasId!)
    )[0] as { id: string }
    await expect(
      getLatestTestEntityRelationVoteScore({
        relationTable: 'relation__post__category__topic_alias',
        relationId: relation.id,
        userId: editor.id,
      }),
    ).resolves.toBe(1)

    await updatePost(editor, post!, { title: `Removed category ${suffix}` })
    await expect(
      getLatestTestEntityRelationVoteScore({
        relationTable: 'relation__post__category__topic_alias',
        relationId: relation.id,
        userId: editor.id,
      }),
    ).resolves.toBe(0)
  })

  it('casts topic votes for the active post owner and skips a deleted owner', async () => {
    const owner = await createTestUser()
    const editor = await createTestUser({ administrator: true })
    const [topicA, topicB] = await Promise.all([
      insertTestCard({ createdById: owner.id }),
      insertTestCard({ createdById: owner.id }),
    ])
    const suffix = Math.random().toString(36).slice(2, 12)
    const post = await createPost(owner, {
      title: `Owner categories ${suffix}`,
      categories: [{ type: 'topic', topic_id: topicA }],
    })

    await updatePost(editor, post!, { categories: [{ type: 'topic', topic_id: topicB }] })
    const topicRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })
    const oldRelation = (
      await getEntityRelation(topicRelation.table_name, post!.id, topicA)
    )[0] as {
      id: string
    }
    const newRelation = (
      await getEntityRelation(topicRelation.table_name, post!.id, topicB)
    )[0] as {
      id: string
    }
    await expect(
      getLatestTestEntityRelationVoteScore({
        relationTable: topicRelation.table_name,
        relationId: oldRelation.id,
        userId: owner.id,
      }),
    ).resolves.toBe(0)
    await expect(
      getLatestTestEntityRelationVoteScore({
        relationTable: topicRelation.table_name,
        relationId: newRelation.id,
        userId: owner.id,
      }),
    ).resolves.toBe(1)
    await expect(
      getLatestTestEntityRelationVoteScore({
        relationTable: topicRelation.table_name,
        relationId: newRelation.id,
        userId: editor.id,
      }),
    ).resolves.toBeUndefined()

    await softDeleteUser(owner.id)
    const topicC = await insertTestCard({ createdById: editor.id })
    await expect(
      updatePost(editor, post!, {
        title: `Editor after deletion #active-${suffix}`,
        categories: [{ type: 'topic', topic_id: topicC }],
      }),
    ).resolves.toMatchObject({ id: post!.id })
    const activeAliasId = await getTopicAliasIdForTest(`active-${suffix}`)
    const activeAliasRelation = (
      await getEntityRelation('relation__post__category__topic_alias', post!.id, activeAliasId!)
    )[0] as { id: string }
    const newTopicRelation = (
      await getEntityRelation(topicRelation.table_name, post!.id, topicC)
    )[0] as { id: string }
    await expect(
      getLatestTestEntityRelationVoteScore({
        relationTable: 'relation__post__category__topic_alias',
        relationId: activeAliasRelation.id,
        userId: editor.id,
      }),
    ).resolves.toBe(1)
    await expect(
      getLatestTestEntityRelationVoteScore({
        relationTable: topicRelation.table_name,
        relationId: newTopicRelation.id,
        userId: owner.id,
      }),
    ).resolves.toBeUndefined()
    await expect(
      getLatestTestEntityRelationVoteScore({
        relationTable: topicRelation.table_name,
        relationId: newTopicRelation.id,
        userId: editor.id,
      }),
    ).resolves.toBeUndefined()
  })

  it('rolls back category relations and votes with the enclosing post transaction', async () => {
    const owner = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const post = await createTestPost({ user: owner, title: `Rollback category ${suffix}` })
    const tag = `rolledback-${suffix}`
    const notificationsBefore = await readAllQueueJobs(notifications)
    const countForPost = (jobs: Awaited<ReturnType<typeof notifications.getJobs>>) =>
      jobs.filter(
        job =>
          job.name === 'processReconcilePostNotifications' &&
          (job.data as { postId: string }).postId === post.id,
      ).length
    const beforeCount = countForPost(notificationsBefore)
    await using query = await beginTransaction()

    await syncPostHashtagCategoriesInTransaction(
      owner,
      post.id,
      { title: `Temporary #${tag}` },
      { query },
    )
    await castPostCategoryVotesInTransaction(query, owner, post.id, owner.id)
    await query.rollback()

    await expect(getTopicAliasIdForTest(tag)).resolves.toBeNull()
    await expect(getPostHashtagSourcesForTest(post.id)).resolves.toEqual([])
    expect(countForPost(await readAllQueueJobs(notifications))).toBe(beforeCount)
  })
})
