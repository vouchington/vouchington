import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  seedBoundedTopicMergeRelations,
  readBoundedTopicMergeRelationState,
} from '@voucha/test-helpers/entities/topic-merge-relations'
import {
  initialTopicMergeRelationCursor,
  processTopicMergeRelationPage,
  processTopicMergeRelationPreflightPage,
  readTopicMergeRelationEffectTargets,
} from './merge-relation-page.mts'
import { relationReferences } from './merge-relations.mts'

const tablePosition = Object.keys(relationReferences).indexOf('relation__topic__related__topic')

async function createTopics() {
  const user = await createTestUser()
  const source = await createTestTopic({ user })
  const destination = await createTestTopic({ user })
  const object = await createTestTopic({ user })
  return { user, source, destination, object }
}

describe('bounded elected topic relation pages', () => {
  it('empties the occupying destination tombstone before creating the live source winner', async () => {
    const { user, source, destination, object } = await createTopics()
    await using query = await beginTransaction()
    const fixture = await seedBoundedTopicMergeRelations(query, {
      sourceId: source.id,
      destinationId: destination.id,
      objectId: object.id,
      requesterId: user.id,
      deletedDestination: true,
      votes: [
        { parent: 'source', userId: user.id, score: 1 },
        { parent: 'destination', userId: user.id, score: -1 },
      ],
    })
    let cursor = initialTopicMergeRelationCursor
    let finished = false
    let effectTargetIds: string[] = []
    for (let page = 0; page < 100; page++) {
      if (cursor.phase === 9)
        effectTargetIds = (
          await readTopicMergeRelationEffectTargets(query, fixture.operationId, tablePosition)
        ).map(target => target.entityRelationId)
      const next = await processTopicMergeRelationPage(
        query,
        fixture.operationId,
        source.id,
        destination.id,
        tablePosition,
        cursor,
        1,
      )
      cursor = next.cursor
      if (!next.hasMore) {
        finished = true
        break
      }
    }
    expect(finished).toBe(true)
    const state = await readBoundedTopicMergeRelationState(
      query,
      source.id,
      destination.id,
      object.id,
      fixture.operationId,
    )
    expect(state.parents).toEqual([
      expect.objectContaining({
        subject_id: destination.id,
        deleted_at: null,
        votes_count_up: 1,
        votes_count_down: 0,
      }),
    ])
    expect(state.parents[0]!.id).not.toBe(fixture.sourceRelationId)
    expect(state.parents[0]!.id).not.toBe(fixture.destinationRelationId)
    expect(state.votes.map(vote => vote.id)).toEqual([fixture.voteIds[0]])
    expect(state.votes[0]!.entity_relation_id).toBe(state.parents[0]!.id)
    expect(effectTargetIds).toEqual(
      expect.arrayContaining([
        fixture.sourceRelationId,
        fixture.destinationRelationId,
        state.parents[0]!.id,
      ]),
    )
    expect(state.mappings).toEqual([])
    expect(state.owners).toEqual([])
  })

  it('keeps the destination parent whole ballot history over newer source events and retains clear events', async () => {
    const { user, source, destination, object } = await createTopics()
    const secondUser = await createTestUser()
    await using query = await beginTransaction()
    const fixture = await seedBoundedTopicMergeRelations(query, {
      sourceId: source.id,
      destinationId: destination.id,
      objectId: object.id,
      requesterId: user.id,
      votes: [
        { parent: 'destination', userId: user.id, score: 1 },
        { parent: 'destination', userId: user.id, score: null },
        { parent: 'source', userId: user.id, score: -1 },
        { parent: 'source', userId: secondUser.id, score: -1 },
        { parent: 'source', userId: secondUser.id, score: 1 },
      ],
    })
    let cursor = initialTopicMergeRelationCursor
    let finished = false
    for (let page = 0; page < 100; page++) {
      const next = await processTopicMergeRelationPage(
        query,
        fixture.operationId,
        source.id,
        destination.id,
        tablePosition,
        cursor,
        1,
      )
      cursor = next.cursor
      if (!next.hasMore) {
        finished = true
        break
      }
    }
    expect(finished).toBe(true)
    const state = await readBoundedTopicMergeRelationState(
      query,
      source.id,
      destination.id,
      object.id,
      fixture.operationId,
    )
    expect(state.parents).toEqual([
      expect.objectContaining({
        id: fixture.destinationRelationId,
        votes_count_up: 1,
        votes_count_down: 0,
      }),
    ])
    expect(state.votes.map(vote => vote.id)).toEqual([
      fixture.voteIds[0],
      fixture.voteIds[1],
      fixture.voteIds[3],
      fixture.voteIds[4],
    ])
    expect(
      state.votes.every(vote => vote.entity_relation_id === fixture.destinationRelationId),
    ).toBe(true)
    expect(state.owners).toEqual([])
  })

  it('rejects same-type unresolved audit flags before creating merge scratch or moving any child', async () => {
    const { user, source, destination, object } = await createTopics()
    await using query = await beginTransaction()
    const fixture = await seedBoundedTopicMergeRelations(query, {
      sourceId: source.id,
      destinationId: destination.id,
      objectId: object.id,
      requesterId: user.id,
      conflictingFlags: true,
      votes: [
        { parent: 'source', userId: user.id, score: 1 },
        { parent: 'destination', userId: user.id, score: -1 },
      ],
    })
    const before = await readBoundedTopicMergeRelationState(
      query,
      source.id,
      destination.id,
      object.id,
      fixture.operationId,
    )
    let cursor = initialTopicMergeRelationCursor
    let errorCode: string | null = null
    for (let page = 0; page < 8; page++) {
      const result = await processTopicMergeRelationPreflightPage(
        query,
        source.id,
        destination.id,
        tablePosition,
        cursor,
        1,
      )
      errorCode = result.errorCode
      cursor = result.cursor
      if (errorCode || !result.hasMore) break
    }
    expect(errorCode).toBe('audit_flag')
    const after = await readBoundedTopicMergeRelationState(
      query,
      source.id,
      destination.id,
      object.id,
      fixture.operationId,
    )
    expect(after).toEqual(before)
    expect(after.mappings).toEqual([])
    expect(after.owners).toEqual([])
  })
})
