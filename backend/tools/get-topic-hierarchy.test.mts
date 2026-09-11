import { beforeAll, describe, expect, it } from 'vitest'
import getTopicHierarchyTool from './get-topic-hierarchy.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { insertTestTopicParentRelation } from '@voucha/test-helpers/entities/topic-hierarchy'
import type { PrivateUser } from '@services/users/types'

describe('get_topic_hierarchy tool — real DB', () => {
  let user: PrivateUser
  let parentTopicId: string
  let childTopicId: string
  const suffix = crypto.randomUUID().slice(0, 8)

  beforeAll(async () => {
    user = await createTestUser()

    parentTopicId = await insertTestTopic({
      name: `Hierarchy Parent ${suffix}`,
      slug: `hierarchy-parent-${suffix}`,
      createdById: user.id,
      topicType: 'topic',
    })

    childTopicId = await insertTestTopic({
      name: `Hierarchy Child ${suffix}`,
      slug: `hierarchy-child-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })

    // Insert parent-child relation: child.subject_id -> parent.object_id
    await insertTestTopicParentRelation({
      childTopicId,
      parentTopicId,
      createdById: user.id,
    })
  })

  it('returns parents for a child topic', async () => {
    const execute = getTopicHierarchyTool.function(user)
    const result = await execute({ topic_id: childTopicId, direction: 'parents' })

    expect(result.success).toBe(true)
    expect(result.topic_id).toBe(childTopicId)
    expect(result.children).toHaveLength(0)
    const parent = result.parents.find(p => p.id === parentTopicId)
    expect(parent).toBeDefined()
    expect(parent?.name).toBe(`Hierarchy Parent ${suffix}`)
  })

  it('returns children for a parent topic', async () => {
    const execute = getTopicHierarchyTool.function(user)
    const result = await execute({ topic_id: parentTopicId, direction: 'children' })

    expect(result.success).toBe(true)
    expect(result.topic_id).toBe(parentTopicId)
    expect(result.parents).toHaveLength(0)
    const child = result.children.find(c => c.id === childTopicId)
    expect(child).toBeDefined()
    expect(child?.name).toBe(`Hierarchy Child ${suffix}`)
  })

  it('returns both directions with default direction', async () => {
    const execute = getTopicHierarchyTool.function(user)
    const result = await execute({ topic_id: childTopicId })

    expect(result.success).toBe(true)
    expect(result.parents.some(p => p.id === parentTopicId)).toBe(true)
  })

  it('returns empty arrays for a topic with no relations', async () => {
    const isolatedId = await insertTestTopic({
      name: `Isolated Topic ${suffix}`,
      slug: `isolated-topic-${suffix}`,
      createdById: user.id,
    })

    const execute = getTopicHierarchyTool.function(user)
    const result = await execute({ topic_id: isolatedId })

    expect(result.success).toBe(true)
    expect(result.parents).toHaveLength(0)
    expect(result.children).toHaveLength(0)
  })
})
