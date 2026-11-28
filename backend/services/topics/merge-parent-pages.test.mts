import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  createTopicMergeParentTestOperation,
  deleteTopicMergeParentTestOperation,
  getTopicMergeParentTestWork,
  mutateTopicMergeParentTestEdge,
  runTopicMergeParentTestPage,
} from '@voucha/test-helpers/entities/topic-merge-parent'
import { seedTopicMergeParentEdges } from '@voucha/test-helpers/topic-merge-relations'

describe('topic merge parent preflight pages', () => {
  it('persists a one-edge fanout page before continuing', async () => {
    const user = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user })
    const destination = await createTestTopic({ user })
    const first = await createTestTopic({ user })
    const second = await createTestTopic({ user })
    await seedTopicMergeParentEdges([
      [source.id, first.id],
      [source.id, second.id],
      [destination.id, first.id],
      [destination.id, second.id],
    ])
    const operationId = await createTopicMergeParentTestOperation(
      source.id,
      destination.id,
      user.id,
    )
    try {
      await expect(
        runTopicMergeParentTestPage(operationId, source.id, destination.id, 1),
      ).resolves.toEqual({ hasMore: true, errorCode: null })
      const work = await getTopicMergeParentTestWork(operationId)
      expect(work).toHaveLength(3)
      expect(work.filter(item => item.depth === 1).map(item => item.topic_id)).toEqual(
        [first.id, second.id].toSorted().slice(0, 1),
      )
      expect(work.filter(item => item.cursor_object_id !== null)).toHaveLength(1)
    } finally {
      await deleteTopicMergeParentTestOperation(operationId)
    }
  })

  it('rejects an indirect contraction cycle', async () => {
    const user = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user })
    const destination = await createTestTopic({ user })
    const ancestor = await createTestTopic({ user })
    await seedTopicMergeParentEdges([
      [destination.id, ancestor.id],
      [ancestor.id, source.id],
    ])
    const operationId = await createTopicMergeParentTestOperation(
      source.id,
      destination.id,
      user.id,
    )
    try {
      let errorCode: string | null = null
      // This three-node fixture needs at most four actual page executions, with no event polling.
      for (let page = 0; page < 4 && errorCode === null; page++) {
        const result = await runTopicMergeParentTestPage(operationId, source.id, destination.id, 1)
        errorCode = result.errorCode
      }
      expect(errorCode).toBe('topic_merge_parent_cycle')
    } finally {
      await deleteTopicMergeParentTestOperation(operationId)
    }
  })

  it('freezes discovered ancestor parent mutations across page transactions', async () => {
    const user = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user })
    const destination = await createTestTopic({ user })
    const ancestor = await createTestTopic({ user })
    const leaf = await createTestTopic({ user })
    const additional = await createTestTopic({ user })
    await seedTopicMergeParentEdges([
      [source.id, ancestor.id],
      [destination.id, ancestor.id],
      [ancestor.id, leaf.id],
    ])
    const operationId = await createTopicMergeParentTestOperation(
      source.id,
      destination.id,
      user.id,
    )
    try {
      await runTopicMergeParentTestPage(operationId, source.id, destination.id, 1)
      await expect(seedTopicMergeParentEdges([[ancestor.id, additional.id]])).rejects.toMatchObject(
        { status: 409, code: 'topic_merge_in_progress' },
      )
      await expect(
        mutateTopicMergeParentTestEdge(ancestor.id, leaf.id, 'tombstone'),
      ).rejects.toMatchObject({ status: 409, code: 'topic_merge_in_progress' })
      await expect(
        mutateTopicMergeParentTestEdge(ancestor.id, leaf.id, 'delete'),
      ).rejects.toMatchObject({ status: 409, code: 'topic_merge_in_progress' })
    } finally {
      await deleteTopicMergeParentTestOperation(operationId)
    }
  })

  it('counts tombstones toward the raw page, advances past them, and reserves only live ancestors', async () => {
    const user = await createTestUser({ administrator: true })
    const [source, destination, ...parents] = await Promise.all(
      Array.from({ length: 5 }, () => createTestTopic({ user })),
    )
    const [firstTopic, secondTopic, thirdTopic] = parents.map(topic => topic.id).toSorted()
    const [ownerId, peerId] = [source!.id, destination!.id].toSorted()
    await seedTopicMergeParentEdges([
      [ownerId!, firstTopic!],
      [ownerId!, secondTopic!],
      [ownerId!, thirdTopic!],
    ])
    await mutateTopicMergeParentTestEdge(ownerId!, firstTopic!, 'tombstone')
    await mutateTopicMergeParentTestEdge(ownerId!, secondTopic!, 'tombstone')
    const operationId = await createTopicMergeParentTestOperation(
      source!.id,
      destination!.id,
      user.id,
    )
    try {
      // First page of size 2 inspects both tombstones, reserves neither, and records the second tombstone as cursor.
      await expect(
        runTopicMergeParentTestPage(operationId, source!.id, destination!.id, 2),
      ).resolves.toEqual({ hasMore: true, errorCode: null })
      const afterFirst = await getTopicMergeParentTestWork(operationId)
      expect(
        afterFirst.map(item => [
          item.topic_id,
          item.depth,
          item.cursor_object_id,
          item.completed_at !== null,
        ]),
      ).toEqual([
        [ownerId, 0, secondTopic, false],
        [peerId, 0, null, false],
      ])

      // Continuation seeks past secondTopic, finds thirdTopic, reserves it at depth 1, and completes ownerId.
      await expect(
        runTopicMergeParentTestPage(operationId, source!.id, destination!.id, 2),
      ).resolves.toEqual({ hasMore: true, errorCode: null })
      const afterSecond = await getTopicMergeParentTestWork(operationId)
      expect(
        afterSecond.map(item => [
          item.topic_id,
          item.depth,
          item.cursor_object_id,
          item.completed_at !== null,
        ]),
      ).toEqual(
        [
          [ownerId!, 0, thirdTopic!, true],
          [peerId!, 0, null, false],
          [thirdTopic!, 1, null, false],
        ].toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))),
      )
    } finally {
      await deleteTopicMergeParentTestOperation(operationId)
    }
  })
})
