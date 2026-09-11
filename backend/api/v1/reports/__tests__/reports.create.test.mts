import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestTopic,
  createTestUrlWithHostname,
  createTestUser,
  insertTestLocalFollow,
  insertTestPost,
  insertTestRssFeed,
  insertTestRssFeedItem,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/reports', () => {
  let user: PrivateUser
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()
    postId = await insertTestPost({
      createdById: user.id,
      slug: `report-api-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report API Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Test body',
    })
  })

  it('returns 401 for unauthenticated requests', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: postId, reason: 'spam' })
      .expect(401)
  })

  it('returns 415 when Content-Type is not json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.post('/api/v1/reports').set('Content-Type', 'text/plain').send('bad').expect(415)
  })

  it('creates a report and returns 201', async () => {
    const reporter = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(reporter)
    const response = await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: postId, reason: 'spam' })
      .expect(201)

    expect(response.body.report).toBeDefined()
    expect(response.body.report.reporter_user_id).toBe(reporter.id)
    expect(response.body.report.entity_type).toBe('post')
    expect(response.body.report.entity_id).toBe(postId)
    expect(response.body.report.reason).toBe('spam')
    expect(response.body.report.status).toBe('pending')
    expect(response.body.report).not.toHaveProperty('case_id')
    expect(response.body.isDuplicate).toBe(false)
  })

  it('returns isDuplicate true when same reporter submits again for same entity', async () => {
    const dupReporter = await createTestUser()
    const dupPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-dup-api-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Dup API ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const request = createRequest()
    await request.authenticateAs(dupReporter)

    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: dupPostId, reason: 'harassment' })
      .expect(201)

    const second = await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: dupPostId, reason: 'spam', note: 'Updated context' })
      .expect(200)

    expect(second.body.isDuplicate).toBe(true)
    expect(second.body.report.reason).toBe('spam')
    expect(second.body.report.note).toBe('Updated context')
  })

  it('returns 422 for invalid entity type', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'invalid_type', entityId: postId, reason: 'spam' })
      .expect(422)
  })

  it('returns 422 for invalid entity ID', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: 'not-a-uuid', reason: 'spam' })
      .expect(422)
  })

  it('returns 422 for invalid reason', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: postId, reason: 'bad_reason' })
      .expect(422)
  })

  it('returns 422 for vote_manipulation reason on a non-post entity', async () => {
    const reporter = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(reporter)
    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'user', entityId: user.id, reason: 'vote_manipulation' })
      .expect(422)
  })

  it('returns 422 when user reports themselves', async () => {
    const selfReporter = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(selfReporter)
    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'user', entityId: selfReporter.id, reason: 'spam' })
      .expect(422)
  })

  it('returns 422 when user reports their own post', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: postId, reason: 'spam' })
      .expect(422)
  })

  it('returns 404 when reportable entity does not exist', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: crypto.randomUUID(), reason: 'spam' })
      .expect(404)
  })

  it('allows reporting an RSS feed item without applying user self-report ownership', async () => {
    const topic = await createTestTopic()
    const feedId = await insertTestRssFeed({ topicId: topic.id, title: 'Reportable feed' })
    const urlId = await createTestUrlWithHostname()
    const rssFeedItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `reportable-item-${crypto.randomUUID()}`,
      itemData: { title: 'Reportable item' },
      contentSha256: Buffer.from('a'.repeat(64), 'hex'),
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'rss_feed_item', entityId: rssFeedItemId, reason: 'spam' })
      .expect(201)

    expect(response.body.report.entity_type).toBe('rss_feed_item')
    expect(response.body.report.entity_id).toBe(rssFeedItemId)
  })

  it('accepts an optional note', async () => {
    const noteReporter = await createTestUser()
    const notePostId = await insertTestPost({
      createdById: user.id,
      slug: `report-note-api-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Note API ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const request = createRequest()
    await request.authenticateAs(noteReporter)
    const response = await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: notePostId, reason: 'other', note: 'Some context' })
      .expect(201)

    expect(response.body.report.note).toBe('Some context')
  })

  it('creates a report for a comment entity type and returns 201', async () => {
    const rootPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-comment-root-api-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Comment Root API ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Root post body',
    })
    const commentId = await insertTestPost({
      createdById: user.id,
      slug: `report-comment-api-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Comment API ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Comment body',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    const commentReporter = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(commentReporter)
    const response = await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'comment', entityId: commentId, reason: 'spam' })
      .expect(201)

    expect(response.body.report.entity_type).toBe('comment')
    expect(response.body.report.entity_id).toBe(commentId)
    expect(response.body.report.status).toBe('pending')
  })

  it('applies root post visibility when reporting a comment', async () => {
    const rootPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-hidden-comment-root-api-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Hidden Comment Root API ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Private root post body',
      privacy: 'private',
      broadcast: 'followers',
    })
    const commentId = await insertTestPost({
      createdById: user.id,
      slug: `report-hidden-comment-api-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Hidden Comment API ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Comment body',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    const commentReporter = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(commentReporter)

    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'comment', entityId: commentId, reason: 'spam' })
      .expect(404)

    await insertTestLocalFollow(commentReporter.id, user.id)

    const response = await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'comment', entityId: commentId, reason: 'spam' })
      .expect(201)

    expect(response.body.report.entity_type).toBe('comment')
    expect(response.body.report.entity_id).toBe(commentId)
  })

  it('normalizes blank notes to null', async () => {
    const noteReporter = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(noteReporter)
    const response = await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: postId, reason: 'other', note: '   ' })
      .expect(201)

    expect(response.body.report.note).toBeNull()
  })
})
