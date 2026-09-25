import crypto from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestPost,
  insertTestTopic,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { EntityRelationEntityType, EntityRelationPredicateType } from './config.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { getEntityRelations } from './query.mts'
import { stubUrlGuardsForSuite } from './test-support.mts'
import { upsertEntityRelation } from './upsert.mts'
import {
  ANONYMOUS_ENTITY_RELATION_VIEWER,
  SYSTEM_ENTITY_RELATION_VIEWER,
  type EntityRelationViewer,
} from './viewer.mts'

const unique = () => crypto.randomUUID().slice(0, 8)

const insertPost = (
  createdById: string,
  options: Partial<Parameters<typeof insertTestPost>[0]> = {},
) => insertTestPost({ title: unique(), slug: unique(), createdById, markdown: 'Body', ...options })

type Tuple = [EntityRelationEntityType, EntityRelationPredicateType, EntityRelationEntityType]

async function relate(creator: PrivateUser, tuple: Tuple, subjectId: string, objectId: string) {
  const [subjectType, predicate, objectType] = tuple
  const metadata = getEntityRelationMetadataOrThrow({ subjectType, predicate, objectType })
  await upsertEntityRelation(creator, metadata, { id: subjectId }, [{ id: objectId }])
}

async function readRelation(
  tuple: Tuple,
  subjectId: string,
  objectId: string,
  viewer: EntityRelationViewer = ANONYMOUS_ENTITY_RELATION_VIEWER,
) {
  const [subjectType, predicate, objectType] = tuple
  const [relation] = await getEntityRelations(subjectType, subjectId, predicate, objectType, {
    viewer,
    objectIds: [objectId],
  })
  return relation
}

const objectDataKeys = async (tuple: Tuple, subjectId: string, objectId: string) =>
  Object.keys((await readRelation(tuple, subjectId, objectId))!.object_data).toSorted()

describe('entity relation object projection', () => {
  stubUrlGuardsForSuite()

  let creator: PrivateUser
  let postId: string
  let topicId: string

  beforeAll(async () => {
    creator = await createTestUser()
    postId = await insertPost(creator.id)
    topicId = await insertTestTopic({
      name: unique(),
      slug: unique(),
      topicType: 'card',
      createdById: creator.id,
    })
  })

  it('projects only public post columns', async () => {
    const tuple: Tuple = ['topic', 'related', 'post']
    await relate(creator, tuple, topicId, postId)
    expect(await objectDataKeys(tuple, topicId, postId)).toEqual([
      'declared_language',
      'id',
      'lingua_rs_detected_language',
      'post_type',
      'title',
    ])
  })

  it('projects only public topic columns', async () => {
    const tuple: Tuple = ['post', 'category', 'topic']
    await relate(creator, tuple, postId, topicId)
    expect(await objectDataKeys(tuple, postId, topicId)).toEqual([
      'id',
      'name',
      'slug',
      'topic_type',
    ])
  })

  it('projects only public url columns and the latest crawl', async () => {
    const hostname = `projection-${unique()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ url: `https://${hostname}/page`, hostnameId })
    const tuple: Tuple = ['post', 'related', 'url']
    await relate(creator, tuple, postId, urlId)
    expect(await objectDataKeys(tuple, postId, urlId)).toEqual([
      'id',
      'latest_crawl',
      'pathname',
      'url',
    ])
  })

  it('projects only public user columns', async () => {
    const mentioned = await createTestUser()
    const tuple: Tuple = ['post', 'mentioned', 'user']
    await relate(creator, tuple, postId, mentioned.id)
    expect(await objectDataKeys(tuple, postId, mentioned.id)).toEqual(['id', 'username'])
  })

  it('projects only public hostname columns', async () => {
    const community = await insertTestCommunity({ createdById: creator.id })
    const hostnameId = await insertTestUrlHostname({
      hostname: `projection-${unique()}.example.com`,
    })
    const tuple: Tuple = ['community', 'mute', 'url_hostname']
    await relate(creator, tuple, community.id, hostnameId)
    expect(await objectDataKeys(tuple, community.id, hostnameId)).toEqual(['hostname', 'id'])
  })

  it('lets system readers see hidden posts and anonymous authors', async () => {
    const privatePostId = await insertPost(creator.id, {
      privacy: 'private',
      broadcast: 'followers',
    })
    const anonymousPostId = await insertPost(creator.id, { isAnonymous: true })
    const tuple: Tuple = ['topic', 'faq', 'post']
    await relate(creator, tuple, topicId, privatePostId)
    await relate(creator, tuple, topicId, anonymousPostId)

    expect(await readRelation(tuple, topicId, privatePostId)).toBeUndefined()
    expect(
      await readRelation(tuple, topicId, privatePostId, SYSTEM_ENTITY_RELATION_VIEWER),
    ).toBeDefined()
    expect((await readRelation(tuple, topicId, anonymousPostId))!.created_by_id).toBeNull()
    expect(
      (await readRelation(tuple, topicId, anonymousPostId, SYSTEM_ENTITY_RELATION_VIEWER))!
        .created_by_id,
    ).toBe(creator.id)
  })
})
