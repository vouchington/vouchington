import { describe, expect, it, onTestFinished } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestTopic,
  createTestUser,
  followTopic,
  followUser,
  insertTestTopic,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import {
  softDeleteEntityRelationTest,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers/entities/entity-relations'
import { updateUserFields } from '@services/users/update-fields'
import { usersWorkConfig } from '@services/users/work-limits'

describe('topic follow context pagination', () => {
  it('caps the count and orders by viewer follow recency and user ID descending across pages', async () => {
    const viewer = await createTestUser()
    const topic = await createTestTopic({
      user: viewer,
      name: `Follow context tie ${viewer.id}`,
      topic_type: 'topic',
    })
    const tiedIds: string[] = []
    const timestamp = new Date('2025-08-01T00:00:00.123Z')
    for (let i = 0; i < 5; i++) {
      const follower = await createTestUser()
      await followUser(viewer, follower)
      await followTopic(follower, topic)
      await updateTestEntityRelationCreatedAt(
        'relation__user__follow__user',
        viewer.id,
        follower.id,
        timestamp,
      )
      tiedIds.push(follower.id)
    }
    const older = await createTestUser()
    await followUser(viewer, older)
    await followTopic(older, topic)
    await updateTestEntityRelationCreatedAt(
      'relation__user__follow__user',
      viewer.id,
      older.id,
      new Date(timestamp.getTime() - 1),
    )
    const expectedIds = tiedIds.toSorted().toReversed()
    await usersWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(usersWorkConfig, {
        topic_follow_context_count_cap: 2,
      }),
    )

    const request = createRequest()
    await request.authenticateAs(viewer)
    const path = `/api/v1/topics/${topic.id}/follow-context`
    const first = (await request.get(path).expect(200)).body.following_topic_followers
    expect(first).toMatchObject({
      total: 2,
      total_is_exact: false,
      users: expectedIds.slice(0, 2).map(id => ({ id })),
      next_cursor: expect.any(String),
    })
    const next = (await request.get(path).query({ after: first.next_cursor }).expect(200)).body
      .following_topic_followers
    expect(next).toMatchObject({
      total: 2,
      total_is_exact: false,
      users: expectedIds.slice(2, 4).map(id => ({ id })),
      next_cursor: expect.any(String),
    })
    const last = (await request.get(path).query({ after: next.next_cursor }).expect(200)).body
      .following_topic_followers
    expect(last).toMatchObject({
      total: 2,
      total_is_exact: true,
      users: [{ id: expectedIds[4] }, { id: older.id }],
      next_cursor: null,
    })
  })

  it('keeps first-page and continuation results independent of hidden topic follows', async () => {
    const viewer = await createTestUser()
    const completeViewer = await createTestUser()
    const visible = await createTestUser()
    const hidden = await createTestUser()
    const unfollowed = await createTestUser()
    const topic = await createTestTopic({
      user: viewer,
      name: `Follow context private ${viewer.id}`,
      topic_type: 'topic',
    })
    await followUser(viewer, visible)
    await followUser(viewer, hidden)
    await followUser(completeViewer, visible)
    await followTopic(visible, topic)
    await updateTestEntityRelationCreatedAt(
      'relation__user__follow__user',
      viewer.id,
      visible.id,
      new Date('2025-08-01T00:00:00.123Z'),
    )
    await updateTestEntityRelationCreatedAt(
      'relation__user__follow__user',
      viewer.id,
      hidden.id,
      new Date('2025-08-01T00:00:00.124Z'),
    )
    await updateUserFields(hidden.id, { topic_follows_visibility: 'nobody' })
    await usersWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(usersWorkConfig, {
        topic_follow_context_inspect_limit: 1,
      }),
    )

    const request = createRequest()
    await request.authenticateAs(viewer)
    const completeRequest = createRequest()
    await completeRequest.authenticateAs(completeViewer)
    const path = `/api/v1/topics/${topic.id}/follow-context`
    const readPages = async () => {
      const first = (await request.get(path).expect(200)).body.following_topic_followers
      expect(first.next_cursor).toEqual(expect.any(String))
      const next = (await request.get(path).query({ after: first.next_cursor }).expect(200)).body
        .following_topic_followers
      const complete = (await completeRequest.get(path).expect(200)).body.following_topic_followers
      return { first, next, complete }
    }
    const before = await readPages()
    await followTopic(hidden, topic)
    await followTopic(unfollowed, topic)
    const afterInsert = await readPages()
    await softDeleteEntityRelationTest(
      'relation__user__follow__topic',
      hidden.id,
      topic.id,
      hidden.id,
    )
    await softDeleteEntityRelationTest(
      'relation__user__follow__topic',
      unfollowed.id,
      topic.id,
      unfollowed.id,
    )
    const afterDelete = await readPages()
    for (const pages of [before, afterInsert, afterDelete]) {
      expect(pages.first).toEqual({
        total: 0,
        total_is_exact: false,
        users: [],
        next_cursor: expect.any(String),
      })
      expect(pages.first.next_cursor).not.toContain(hidden.id)
      expect(Buffer.from(pages.first.next_cursor, 'base64url').toString()).not.toContain(hidden.id)
      expect(pages.next).toMatchObject({
        total: 1,
        total_is_exact: true,
        users: [{ id: visible.id }],
        next_cursor: null,
      })
      expect(pages.complete).toEqual(pages.next)
    }
    await completeRequest.get(path).query({ after: before.first.next_cursor }).expect(400)
    const otherTopicId = await insertTestTopic({
      name: `Follow context cursor scope ${viewer.id}`,
      slug: `follow-context-cursor-scope-${viewer.id}`,
      createdById: viewer.id,
    })
    await request
      .get(`/api/v1/topics/${otherTopicId}/follow-context`)
      .query({ after: before.first.next_cursor })
      .expect(400)
    await request.get(path).query({ after: 'invalid' }).expect(400)
  })
})
