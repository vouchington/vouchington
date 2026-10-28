import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { seedTopicMergeParentEdges } from '@voucha/test-helpers/topic-merge-relations'
import { getTopicMergeParentEdge } from '@voucha/test-helpers/entities/topic-merge-parent'
import { getEntityRelationMetadataOrThrow } from '../entity-relations/metadata.mts'
import { upsertEntityRelation } from '../entity-relations/upsert.mts'
import { getEntityRelations } from '../entity-relations/query.mts'
import { getTopicByAny } from './get.mts'
import { createTopicMergeOperation, getTopicMergeOperation } from './merge-operations.mts'
import { processTopicMergeOperationPage } from './merge-operation-page.mts'
import { topicMergeWorkConfig } from './merge-work-limits.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

describe('topic merge lifecycle ordering', () => {
  it('rejects the younger connected merge before effects and lets the older merge complete', async () => {
    const admin = await createTestUser({ administrator: true })
    const [firstChild, secondChild, parent, childDestination, parentDestination] =
      await Promise.all(Array.from({ length: 5 }, () => createTestTopic({ user: admin })))
    const [unrelatedChild, child] = [firstChild!, secondChild!].toSorted((a, b) =>
      a.id.localeCompare(b.id),
    )
    onTestFinished(overrideDynamicConfigFieldsForTest(topicMergeWorkConfig, { page_size: 1 }))
    // The conflicting endpoint is beyond the first raw incident page.
    await seedTopicMergeParentEdges([
      [unrelatedChild!.id, parent!.id],
      [child!.id, parent!.id],
    ])
    const [childTopic, parentTopic, childDestinationTopic, parentDestinationTopic] =
      await Promise.all(
        [child!, parent!, childDestination!, parentDestination!].map(row => getTopicByAny(row.id)),
      )
    const first = await createTopicMergeOperation(admin, childTopic!, childDestinationTopic!)
    const second = await createTopicMergeOperation(admin, parentTopic!, parentDestinationTopic!)
    await expect(getTopicMergeOperation(admin, child!.id, first.id)).resolves.toMatchObject({
      status: 'queued',
    })
    await expect(getTopicMergeOperation(admin, parent!.id, second.id)).resolves.toMatchObject({
      status: 'queued',
    })
    let generation: number | null = 0
    for (let page = 0; page < 2000 && generation !== null; page++) {
      generation = await processTopicMergeOperationPage(second.id, generation)
    }
    expect(generation).toBeNull()
    await expect(getTopicMergeOperation(admin, parent!.id, second.id)).resolves.toMatchObject({
      status: 'failed',
      error_code: 'topic_merge_reservation_conflict',
    })
    await expect(getTopicByAny(parent!.id)).resolves.toMatchObject({ id: parent!.id })
    await expect(getTopicMergeParentEdge(child!.id, parent!.id)).resolves.toMatchObject({
      deleted_at: null,
    })
    generation = 0
    for (let page = 0; page < 2000 && generation !== null; page++) {
      generation = await processTopicMergeOperationPage(first.id, generation)
    }
    expect(generation).toBeNull()
    await expect(getTopicMergeOperation(admin, child!.id, first.id)).resolves.toMatchObject({
      status: 'completed',
    })

    const retry = await createTopicMergeOperation(admin, parentTopic!, parentDestinationTopic!)
    generation = 0
    for (let page = 0; page < 2000 && generation !== null; page++) {
      generation = await processTopicMergeOperationPage(retry.id, generation)
    }
    expect(generation).toBeNull()
    await expect(getTopicMergeOperation(admin, parent!.id, retry.id)).resolves.toMatchObject({
      status: 'completed',
    })
  })

  it('admits independent merge reservations concurrently', async () => {
    const admin = await createTestUser({ administrator: true })
    const topics = await Promise.all(
      Array.from({ length: 4 }, () => createTestTopic({ user: admin })),
    )
    const [firstSource, firstDestination, secondSource, secondDestination] = await Promise.all(
      topics.map(row => getTopicByAny(row.id)),
    )
    const first = await createTopicMergeOperation(admin, firstSource!, firstDestination!)
    const second = await createTopicMergeOperation(admin, secondSource!, secondDestination!)
    await expect(getTopicMergeOperation(admin, topics[0]!.id, first.id)).resolves.toMatchObject({
      status: 'queued',
    })
    await expect(getTopicMergeOperation(admin, topics[2]!.id, second.id)).resolves.toMatchObject({
      status: 'queued',
    })
    for (const operation of [first, second]) {
      let generation: number | null = 0
      for (let page = 0; page < 2000 && generation !== null; page++) {
        generation = await processTopicMergeOperationPage(operation.id, generation)
      }
      expect(generation).toBeNull()
    }
    await expect(getTopicMergeOperation(admin, topics[0]!.id, first.id)).resolves.toMatchObject({
      status: 'completed',
    })
    await expect(getTopicMergeOperation(admin, topics[2]!.id, second.id)).resolves.toMatchObject({
      status: 'completed',
    })
  })

  it('moves an existing follow and refuses new follows during its reservation', async () => {
    const admin = await createTestUser({ administrator: true })
    const sourceId = (await createTestTopic({ user: admin })).id
    const destinationId = (await createTestTopic({ user: admin })).id
    const source = (await getTopicByAny(sourceId))!
    const destination = (await getTopicByAny(destinationId))!
    const follow = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: 'topic',
      predicate: 'follow',
    })
    await upsertEntityRelation(admin, follow, { id: admin.id }, [{ id: sourceId }], {
      vote: false,
    })
    const operation = await createTopicMergeOperation(admin, source, destination)
    const otherUser = await createTestUser()
    await expect(
      upsertEntityRelation(otherUser, follow, { id: otherUser.id }, [{ id: sourceId }], {
        vote: false,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'topic_merge_in_progress' })
    let generation: number | null = 0
    for (let page = 0; page < 2000 && generation !== null; page++) {
      generation = await processTopicMergeOperationPage(operation.id, generation)
    }
    expect(generation).toBeNull()
    await expect(getTopicMergeOperation(admin, sourceId, operation.id)).resolves.toMatchObject({
      status: 'completed',
    })
    const relations = await getEntityRelations('user', admin.id, 'follow', 'topic', {
      viewer: { kind: 'anonymous' },
    })
    expect(relations.map(relation => relation.object_id)).toContain(destinationId)
    expect(relations.map(relation => relation.object_id)).not.toContain(sourceId)
  })
})
