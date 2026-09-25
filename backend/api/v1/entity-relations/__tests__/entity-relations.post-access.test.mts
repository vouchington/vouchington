import crypto from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUserWithAge,
  createTestUrlWithHostname,
  CONTRIBUTING_USER_AGE_MS,
  insertTestCommunity,
  insertTestPendingCommunityPostReview,
  insertTestPost,
  insertTestTopic,
  suspendTestUser,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'

import { upsertEntityRelation } from '@services/entity-relations'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'

import type { PrivateUser } from '@services/users/types'

const slug = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

function metadataFor(subjectType: string, predicate: string, objectType: string) {
  return entityRelationMetadatum.find(
    m =>
      m.subject_type === subjectType && m.predicate === predicate && m.object_type === objectType,
  )!
}

async function insertTopic(createdById: string): Promise<string> {
  return insertTestTopic({
    name: slug('Post Access Topic'),
    slug: slug('post-access-topic'),
    topicType: 'card',
    createdById,
  })
}

async function insertPost(
  createdById: string,
  options: { privacy?: 'public' | 'private'; isAnonymous?: boolean; communityId?: string } = {},
): Promise<string> {
  return insertTestPost({
    title: slug('Post Access Post'),
    slug: slug('post-access-post'),
    createdById,
    markdown: 'Post access body',
    // Followers-only keeps private posts off-limits to members who do not follow the author.
    ...(options.privacy === 'private' ? { broadcast: 'followers' as const } : {}),
    ...options,
  })
}

type RelationBody = {
  results: { id: string }[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
  entity_relations: Record<string, { object_id: string; created_by_id: string | null }>
}

async function listRelations(path: string, viewer?: PrivateUser): Promise<RelationBody> {
  const request = createRequest()
  if (viewer) await request.authenticateAs(viewer)
  const response = await request.get(`/api/v1/entity-relations/${path}`).expect(200)
  return response.body as RelationBody
}

async function relate(viewer: PrivateUser, path: string, objectId: string) {
  const request = createRequest()
  await request.authenticateAs(viewer)
  return request.post(`/api/v1/entity-relations/${path}`).send({ objectId })
}

const objectIdsOf = (body: RelationBody) =>
  Object.values(body.entity_relations).map(relation => relation.object_id)

describe('entity-relations post access', () => {
  let author: PrivateUser
  let member: PrivateUser
  let moderator: PrivateUser

  beforeAll(async () => {
    author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    member = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    moderator = await createTestUser({ extraRoles: ['moderator'] })
  })

  describe('a subject post a community is reviewing', () => {
    let communityId: string
    let pendingPostId: string

    beforeAll(async () => {
      communityId = (await insertTestCommunity({ createdById: author.id })).id
      pendingPostId = await insertPost(author.id, { communityId })
      await insertTestPendingCommunityPostReview({
        communityId,
        postId: pendingPostId,
        submittedById: author.id,
      })
    })

    it('lets its author relate a URL and read the relation back', async () => {
      const urlId = await createTestUrlWithHostname()
      const response = await relate(author, `post/${pendingPostId}/related/url`, urlId)
      expect(response.status).toBe(201)
      expect(response.body.relation).toEqual(
        expect.objectContaining({ object_id: urlId, created_by_id: author.id }),
      )
      expect(objectIdsOf(await listRelations(`post/${pendingPostId}/related/url`, author))).toEqual(
        [urlId],
      )
    })

    it('hides it from other members until the community approves it', async () => {
      const topicId = await insertTopic(author.id)
      const path = `post/${pendingPostId}/category/topic`
      expect((await relate(author, path, topicId)).status).toBe(201)

      expect((await relate(member, path, await insertTopic(member.id))).status).toBe(404)
      expect((await listRelations(path, member)).results).toEqual([])
      expect((await listRelations(path)).results).toEqual([])

      await updateTestCommunityPostReviewState({
        communityId,
        postId: pendingPostId,
        approvedAt: new Date(),
      })
      expect(objectIdsOf(await listRelations(path))).toEqual([topicId])
    })
  })

  describe('object posts', () => {
    let suspendedAuthor: PrivateUser
    let suspendedAuthorPostId: string
    let publicPostId: string

    beforeAll(async () => {
      suspendedAuthor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      suspendedAuthorPostId = await insertPost(suspendedAuthor.id)
      publicPostId = await insertPost(author.id)
      await suspendTestUser(suspendedAuthor.id)
    })

    it('relates a post the viewer can open but leaves it out of listings', async () => {
      const topicId = await insertTopic(author.id)
      const path = `topic/${topicId}/faq/post`
      await upsertEntityRelation(author, metadataFor('topic', 'faq', 'post'), { id: topicId }, [
        { id: publicPostId },
      ])

      const response = await relate(member, path, suspendedAuthorPostId)
      expect(response.status).toBe(201)
      expect(response.body.relation.object_id).toBe(suspendedAuthorPostId)

      expect(objectIdsOf(await listRelations(path, member))).toEqual([publicPostId])
      expect(objectIdsOf(await listRelations(path))).toEqual([publicPostId])
    })
  })

  it('masks anonymous authors from moderators', async () => {
    const anonymousPostId = await insertPost(author.id, { isAnonymous: true })
    const topicId = await insertTopic(author.id)
    await upsertEntityRelation(
      author,
      metadataFor('post', 'category', 'topic'),
      { id: anonymousPostId },
      [{ id: topicId }],
    )
    const body = await listRelations(`post/${anonymousPostId}/category/topic`, moderator)
    expect(Object.values(body.entity_relations).map(r => r.created_by_id)).toEqual([null])
  })

  it('fills each page with readable relations when hidden ones fall between them', async () => {
    const topicId = await insertTopic(author.id)
    const readablePostIds: string[] = []
    for (const privacy of ['public', 'private', 'public', 'private', 'public'] as const) {
      const postId = await insertPost(author.id, { privacy })
      if (privacy === 'public') readablePostIds.push(postId)
      await upsertEntityRelation(author, metadataFor('topic', 'faq', 'post'), { id: topicId }, [
        { id: postId },
      ])
    }
    const path = `topic/${topicId}/faq/post?sort=newest&limit=2`

    const firstPage = await listRelations(path, member)
    expect(firstPage.results).toHaveLength(2)
    expect(firstPage.page_info.has_next_page).toBe(true)

    const secondPage = await listRelations(
      `${path}&after=${encodeURIComponent(firstPage.page_info.end_cursor!)}`,
      member,
    )
    expect(secondPage.results).toHaveLength(1)
    expect(secondPage.page_info.has_next_page).toBe(false)

    const listed = [...objectIdsOf(firstPage), ...objectIdsOf(secondPage)]
    expect(listed.toSorted()).toEqual(readablePostIds.toSorted())
  })
})
