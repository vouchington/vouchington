import { it, expect, describe } from 'vitest'
import { getEntityRelations } from './query.mts'
import { upsertEntityRelation } from './upsert.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { stubUrlGuardsForSuite } from './test-support.mts'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestUrl,
  insertTestUrlHostname,
  insertTestCrawl,
} from '@voucha/test-helpers'

describe('query.generated', () => {
  stubUrlGuardsForSuite()

  it('getEntityRelations returns relations with joined object data', async () => {
    const user = await createTestUser({ administrator: true })
    const subject = await createTestTopic()
    const objectPost = await createTestPost()

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'post',
      predicate: 'related',
    })

    await upsertEntityRelation(user!, metadata, subject, [objectPost])

    const results = await getEntityRelations('topic', subject.id, 'related', 'post')

    expect(results.length).toBeGreaterThanOrEqual(1)
    const result = results.find(r => r.object_id === objectPost.id)
    expect(result).toBeDefined()
    expect(result!.subject_id).toBe(subject.id)
    expect(result!.object_data).toBeDefined()
    expect((result!.object_data as { id: string }).id).toBe(objectPost.id)
  })

  it('does not expose the internal outbound Follow activity identity', async () => {
    const follower = await createTestUser()
    const followee = await createTestUser()
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: 'user',
      predicate: 'follow',
    })

    await upsertEntityRelation(follower!, metadata, follower!, [followee!])
    const results = await getEntityRelations('user', follower!.id, 'follow', 'user')
    const result = results.find(row => row.object_id === followee!.id)

    expect(result).toBeDefined()
    expect(result).not.toHaveProperty('outbound_ap_follow_activity_id')
  })

  it('getEntityRelations returns empty array when no relations exist', async () => {
    const subject = await createTestTopic()

    // No relations created for this topic
    const results = await getEntityRelations('topic', subject.id, 'related', 'post')

    // Should return empty (no matches for this specific subject)
    expect(results.filter(r => r.subject_id === subject.id)).toHaveLength(0)
  })

  it('getEntityRelations throws for unknown entity relation', async () => {
    await expect(
      getEntityRelations('topic', 'any-id', 'nonexistent_predicate', 'post'),
    ).rejects.toThrow(Error)
  })

  it('getEntityRelations respects limit option', async () => {
    const user = await createTestUser({ administrator: true })
    const subject = await createTestTopic()
    const posts = await Promise.all([createTestPost(), createTestPost(), createTestPost()])

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'post',
      predicate: 'related',
    })

    await upsertEntityRelation(user!, metadata, subject, posts)

    const results = await getEntityRelations('topic', subject.id, 'related', 'post', { limit: 2 })
    expect(results.length).toBe(2)
  })

  it('getEntityRelations works with post->topic category relation', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const topic = await createTestTopic()

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })

    await upsertEntityRelation(user!, metadata, post, [topic])

    const results = await getEntityRelations('post', post.id, 'category', 'topic')

    expect(results.length).toBeGreaterThanOrEqual(1)
    const result = results.find(r => r.object_id === topic.id)
    expect(result).toBeDefined()
    expect(result!.subject_id).toBe(post.id)
    expect((result!.object_data as { id: string }).id).toBe(topic.id)
  })

  it('getEntityRelations works with post->url relation (object without soft delete)', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()

    // Create a URL without soft delete support
    const random = Math.random().toString(36).slice(2, 8)
    const hostnameId = await insertTestUrlHostname({
      hostname: `post-url-test-${random}.example.com`,
    })

    const urlId = await insertTestUrl({
      url: `https://post-url-test-${random}.example.com/test`,
      hostnameId,
    })

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })

    await upsertEntityRelation(user!, metadata, post, [{ id: urlId }])

    // This should work without applying deleted_at filter for urls.
    // Note: 'related' is an election-enabled predicate, so this test also validates
    // that has_soft_delete: false works correctly with election infrastructure
    const results = await getEntityRelations('post', post.id, 'related', 'url')

    expect(results.length).toBeGreaterThanOrEqual(1)
    const result = results.find(r => r.object_id === urlId)
    expect(result).toBeDefined()
    expect(result!.subject_id).toBe(post.id)
  })

  it('getEntityRelations includes latest_crawl=null in object_data for urls without a crawl', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()

    const random = Math.random().toString(36).slice(2, 8)
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawl-null-test-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://crawl-null-test-${random}.example.com/no-crawl`,
      hostnameId,
    })

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })
    await upsertEntityRelation(user!, metadata, post, [{ id: urlId }])

    const results = await getEntityRelations('post', post.id, 'related', 'url')
    const result = results.find(r => r.object_id === urlId)
    expect(result).toBeDefined()
    const data = result!.object_data as { latest_crawl: unknown }
    expect(data.latest_crawl).toBeNull()
  })

  it('getEntityRelations proxies og:image via /sideload/ in latest_crawl for url objects', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()

    const random = Math.random().toString(36).slice(2, 8)
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawl-data-test-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://crawl-data-test-${random}.example.com/article`,
      hostnameId,
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '# Test article',
      title: 'Test Article Title',
      metaTags: { 'og:image': 'https://example.com/image.jpg' },
    })

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })
    await upsertEntityRelation(user!, metadata, post, [{ id: urlId }])

    const results = await getEntityRelations('post', post.id, 'related', 'url')
    const result = results.find(r => r.object_id === urlId)
    expect(result).toBeDefined()
    const data = result!.object_data as {
      latest_crawl: { title: string; image_url: string } | null
    }
    expect(data.latest_crawl).not.toBeNull()
    expect(data.latest_crawl!.title).toBe('Test Article Title')
    expect(data.latest_crawl!.image_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
    expect(data.latest_crawl!.image_url).toContain('w=64')
  })

  it('getEntityRelations sets image_url to null when og:image is a protocol-relative URL', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()

    const random = Math.random().toString(36).slice(2, 8)
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawl-proto-rel-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://crawl-proto-rel-${random}.example.com/article`,
      hostnameId,
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      title: 'Protocol-Relative Image Article',
      metaTags: { 'og:image': '//cdn.example.com/img.jpg' },
    })

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })
    await upsertEntityRelation(user!, metadata, post, [{ id: urlId }])

    const results = await getEntityRelations('post', post.id, 'related', 'url')
    const result = results.find(r => r.object_id === urlId)
    expect(result).toBeDefined()
    const data = result!.object_data as {
      latest_crawl: { title: string; image_url: string | null } | null
    }
    expect(data.latest_crawl).not.toBeNull()
    expect(data.latest_crawl!.image_url).toBeNull()
  })

  it('getEntityRelations returns row unchanged when url object has no crawl image_url', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()

    const random = Math.random().toString(36).slice(2, 8)
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawl-no-img-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://crawl-no-img-${random}.example.com/article`,
      hostnameId,
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      title: 'No Image Article',
    })

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })
    await upsertEntityRelation(user!, metadata, post, [{ id: urlId }])

    const results = await getEntityRelations('post', post.id, 'related', 'url')
    const result = results.find(r => r.object_id === urlId)
    expect(result).toBeDefined()
    const data = result!.object_data as {
      latest_crawl: { title: string; image_url: string | null } | null
    }
    expect(data.latest_crawl).not.toBeNull()
    expect(data.latest_crawl!.image_url).toBeNull()
  })
})
