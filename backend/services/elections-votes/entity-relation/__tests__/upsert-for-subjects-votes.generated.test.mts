import { it, expect, describe } from 'vitest'
import { upsertEntityRelationsForSubjects } from '@services/entity-relations/upsert-for-subjects'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import {
  createRandomString,
  createTestUserDirect,
  insertTestPost,
  insertTestTopic,
} from '@voucha/test-helpers'
import { getEntityRelationElectionVote } from '../votes-get.mts'

describe('upsert-for-subjects.generated (votes)', () => {
  async function createTopic(createdById: string) {
    const random = createRandomString(10)
    const id = await insertTestTopic({
      name: `Relation Topic ${random}`,
      slug: `relation-topic-${random}`,
      createdById,
    })
    return { id }
  }

  async function createPost(createdById: string) {
    const random = createRandomString(10)
    const id = await insertTestPost({
      title: `Relation Post ${random}`,
      slug: `relation-post-${random}`,
      createdById,
      markdown: `Relation post ${random}`,
    })
    return { id }
  }

  it('upsertEntityRelationsForSubjects automatically votes when relation has election', async () => {
    const user = await createTestUserDirect()
    const subject = await createTopic(user!.id)
    const objectPost = await createPost(user!.id)

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'post',
      predicate: 'related',
    })
    expect(metadata.election).toBe(true)

    const relations = await upsertEntityRelationsForSubjects(user!, metadata, [subject], objectPost)

    expect(relations.length).toBe(1)
    expect(relations[0].id).toBeDefined()

    const vote = await getEntityRelationElectionVote(user!.id, relations[0].id!)
    expect(vote).not.toBeNull()
    expect(vote!.choice).toBe('confirm')
  })

  it('upsertEntityRelationsForSubjects does not vote when options.vote is false', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const subject = await createTopic(user!.id)
    const objectPost = await createPost(user!.id)

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'post',
      predicate: 'related',
    })
    expect(metadata.election).toBe(true)

    const relations = await upsertEntityRelationsForSubjects(
      user!,
      metadata,
      [subject],
      objectPost,
      {
        vote: false,
      },
    )

    expect(relations.length).toBe(1)
    expect(relations[0].id).toBeDefined()

    const vote = await getEntityRelationElectionVote(user!.id, relations[0].id!)
    expect(vote).toBeNull()
  })
})
