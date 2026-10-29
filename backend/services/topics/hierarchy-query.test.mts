import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  insertEntityRelation,
  softDeleteEntityRelationTest,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers/entities/entity-relations'
import { describe, expect, it } from 'vitest'
import { getTopicChildren, getTopicParents } from './hierarchy.mts'

const relation = 'relation__topic__parent__topic'

describe('topic hierarchy complete lists', () => {
  it('returns every live parent and child in relation creation order', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const parents = await Promise.all(Array.from({ length: 3 }, () => createTestTopic({ user })))
    const children = await Promise.all(Array.from({ length: 2 }, () => createTestTopic({ user })))

    for (const [index, parent] of parents.entries()) {
      await insertEntityRelation(relation, topic.id, parent.id)
      await updateTestEntityRelationCreatedAt(
        relation,
        topic.id,
        parent.id,
        new Date(`2026-01-0${index + 1}T00:00:00.000Z`),
      )
    }
    for (const [index, child] of children.entries()) {
      await insertEntityRelation(relation, child.id, topic.id)
      await updateTestEntityRelationCreatedAt(
        relation,
        child.id,
        topic.id,
        new Date(`2026-02-0${index + 1}T00:00:00.000Z`),
      )
    }
    await softDeleteEntityRelationTest(relation, topic.id, parents[1]!.id)
    await softDeleteEntityRelationTest(relation, children[1]!.id, topic.id)

    expect((await getTopicParents(topic.id)).map(parent => parent.id)).toEqual([
      parents[0]!.id,
      parents[2]!.id,
    ])
    expect((await getTopicChildren(topic.id)).map(child => child.id)).toEqual([children[0]!.id])
  })
})
