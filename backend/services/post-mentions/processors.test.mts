import { expect, it, describe } from 'vitest'
import { processPostMentions } from './processors.mts'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import {
  createTestUser,
  createTestUserDirect,
  getMentionRowsForRelationTable,
  insertTestPost,
  insertTestTopic,
  updatePostTitleMarkdown,
} from '@voucha/test-helpers'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { invalidate } from '@services/entity-cache'
import { upsertUser } from '@services/users/create'

describe('processors', () => {
  const getMentionTable = (subjectType: 'user' | 'topic' | 'post') => {
    const relation = entityRelationMetadatum.find(
      r =>
        r.subject_type === subjectType && r.object_type === 'post' && r.predicate === 'mentioned',
    )
    if (!relation) {
      throw new Error(`Missing mentioned relation metadata for ${subjectType} -> post`)
    }
    return relation.table_name
  }

  const updatePostContent = async (postId: string, title: string, markdown: string) => {
    await updatePostTitleMarkdown(postId, title, markdown)
    await invalidate.posts(postId)
  }

  it('processPostMentions upserts and soft-deletes mention relations', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    await upsertUser({
      emailAddress: 'system@voucha.ai',
      deviceId: `device-${random}`,
      sessionId: `session-${random}`,
    })
    const author = await createTestUser()
    const mentionedUser = await createTestUser({ username: `mention-${random}` })
    const topicId = await insertTestTopic({
      name: `Topic ${random}`,
      slug: `topic-${random}`,
      createdById: author!.id,
    })
    const mentionedPostId = await insertTestPost({
      title: `Mentioned post ${random}`,
      slug: `mentioned-post-${random}`,
      createdById: author!.id,
      markdown: 'Mentioned post body',
    })
    const postId = await insertTestPost({
      title: `Hello @${mentionedUser!.username}`,
      slug: `mention-host-${random}`,
      createdById: author!.id,
      markdown: `Check #topic-${random} and !mentioned-post-${random}`,
    })
    await processPostMentions({ postId })

    const userTable = getMentionTable('user')
    const topicTable = getMentionTable('topic')
    const postTable = getMentionTable('post')

    const userRows = await getMentionRowsForRelationTable(userTable, postId)
    const topicRows = await getMentionRowsForRelationTable(topicTable, postId)
    const postRows = await getMentionRowsForRelationTable(postTable, postId)

    expect(userRows.map(row => row.subject_id)).toEqual([mentionedUser!.id])
    expect(topicRows.map(row => row.subject_id)).toEqual([topicId])
    expect(postRows.map(row => row.subject_id)).toEqual([mentionedPostId])
    expect(userRows[0].deleted_at).toBeNull()
    expect(topicRows[0].deleted_at).toBeNull()
    expect(postRows[0].deleted_at).toBeNull()

    await updatePostContent(postId, 'No user mention', `Still about #topic-${random}`)
    await processPostMentions({ postId })

    const userRowsAfter = await getMentionRowsForRelationTable(userTable, postId)
    const topicRowsAfter = await getMentionRowsForRelationTable(topicTable, postId)
    const postRowsAfter = await getMentionRowsForRelationTable(postTable, postId)

    expect(userRowsAfter).toHaveLength(1)
    expect(userRowsAfter[0].subject_id).toBe(mentionedUser!.id)
    expect(userRowsAfter[0].deleted_at).not.toBeNull()

    expect(topicRowsAfter).toHaveLength(1)
    expect(topicRowsAfter[0].subject_id).toBe(topicId)
    expect(topicRowsAfter[0].deleted_at).toBeNull()

    expect(postRowsAfter).toHaveLength(1)
    expect(postRowsAfter[0].subject_id).toBe(mentionedPostId)
    expect(postRowsAfter[0].deleted_at).not.toBeNull()
  })

  it('processPostMentions ignores invalid mention-like text and resolves comment permalink urls', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    await upsertUser({
      emailAddress: `system-mentions-${random}@voucha.ai`,
      deviceId: `device-comment-${random}`,
      sessionId: `session-comment-${random}`,
    })
    const author = await createTestUserDirect()
    const rootPostId = await insertTestPost({
      title: `Root post ${random}`,
      slug: `root-post-${random}`,
      createdById: author!.id,
      markdown: 'Root post body',
    })
    const commentId = await insertTestPost({
      title: '',
      slug: `comment-${random}`,
      createdById: author!.id,
      markdown: 'Comment body',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    const hostPostId = await insertTestPost({
      title: `Mention host ${random}`,
      slug: `mention-host-comment-${random}`,
      createdById: author!.id,
      markdown: `Ignore email@test.com and midword#topic but link !${SITEMAP_CONFIG.BASE_URL}/discussion/root-post-${random}/comment/${commentId}`,
    })
    await processPostMentions({ postId: hostPostId })

    const userRows = await getMentionRowsForRelationTable(getMentionTable('user'), hostPostId)
    const topicRows = await getMentionRowsForRelationTable(getMentionTable('topic'), hostPostId)
    const postRows = await getMentionRowsForRelationTable(getMentionTable('post'), hostPostId)

    expect(userRows).toHaveLength(0)
    expect(topicRows).toHaveLength(0)
    expect(postRows.map(row => row.subject_id)).toEqual([commentId])
    expect(postRows[0].deleted_at).toBeNull()
  }, 60_000)
})
