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

/** Canonical lowercase UUID strings sort in the same byte order as PostgreSQL `uuid`. */
function compareUuid(left: string, right: string): number {
  return left < right ? -1 : Number(left > right)
}

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
    const [firstTopic, secondTopic, thirdTopic] = parents
      .map(topic => topic.id)
      .toSorted(compareUuid)
    const [ownerId, peerId] = [source!.id, destination!.id].toSorted(compareUuid)
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
      const expectedAfterSecond: [string, number, string | null, boolean][] = (
        [
          [ownerId!, 0, thirdTopic!, true],
          [peerId!, 0, null, false],
          [thirdTopic!, 1, null, false],
        ] as [string, number, string | null, boolean][]
      ).toSorted((left, right) => compareUuid(left[0], right[0]))
      expect(
        afterSecond.map(item => [
          item.topic_id,
          item.depth,
          item.cursor_object_id,
          item.completed_at !== null,
        ]),
      ).toEqual(expectedAfterSecond)
    } finally {
      await deleteTopicMergeParentTestOperation(operationId)
    }
  })

  it('walks three pages of parents in PostgreSQL uuid order without skipping or repeating any parent', async () => {
    const user = await createTestUser({ administrator: true })
    const [source, destination, ...parentTopics] = await Promise.all(
      Array.from({ length: 7 }, () => createTestTopic({ user })),
    )
    const [ownerId, peerId] = [source!.id, destination!.id].toSorted(compareUuid)
    const orderedParents = parentTopics.map(topic => topic.id).toSorted(compareUuid)
    // Insert edges out of UUID order so the database index supplies the page order.
    await seedTopicMergeParentEdges(
      [
        orderedParents[3]!,
        orderedParents[0]!,
        orderedParents[4]!,
        orderedParents[1]!,
        orderedParents[2]!,
      ].map(parentId => [ownerId!, parentId]),
    )
    const operationId = await createTopicMergeParentTestOperation(
      source!.id,
      destination!.id,
      user.id,
    )
    try {
      const observedParents: string[] = []
      const observedCursors: (string | null)[] = []
      const observedCompleted: boolean[] = []

      for (let page = 0; page < 3; page++) {
        await expect(
          runTopicMergeParentTestPage(operationId, source!.id, destination!.id, 2),
        ).resolves.toEqual({ hasMore: true, errorCode: null })
        const work = await getTopicMergeParentTestWork(operationId)
        const ownerWork = work.find(item => item.topic_id === ownerId)
        expect(ownerWork).toBeDefined()
        observedCursors.push(ownerWork!.cursor_object_id)
        observedCompleted.push(ownerWork!.completed_at !== null)

        const seenBefore = new Set(observedParents)
        const newlyReserved = work
          .filter(item => item.depth === 1 && !seenBefore.has(item.topic_id))
          .map(item => item.topic_id)
        expect(newlyReserved).toEqual(orderedParents.slice(page * 2, page * 2 + 2))
        observedParents.push(...newlyReserved)
        expect(work.find(item => item.topic_id === peerId)?.completed_at).toBeNull()
      }

      expect(observedParents).toEqual(orderedParents)
      expect(new Set(observedParents).size).toBe(orderedParents.length)
      expect(observedCursors).toEqual([orderedParents[1], orderedParents[3], orderedParents[4]])
      expect(observedCompleted).toEqual([false, false, true])
    } finally {
      await deleteTopicMergeParentTestOperation(operationId)
    }
  })
})
