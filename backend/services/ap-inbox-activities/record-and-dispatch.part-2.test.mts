import { describe, it, expect } from 'vitest'
import {
  getEntityRelationDeletionState,
  getEntityRelationMetadataOrThrow,
  softDeleteEntityRelation,
  upsertEntityRelation,
} from '@services/entity-relations'
import { createRemoteActorFixture, createFederatedUser } from './test-fixtures.mts'

// Round-9 review fix: the sequential test in record-and-dispatch.test.mts (round-7) passes whether
// or not recoverDuplicateFollow's write is actually guarded — a separate read-then-check happens
// to agree with the write once the delete has already committed, either way. This is a direct
// unit test on upsertEntityRelation's skipIfDeleted option itself, the only way to distinguish the
// fixed atomic-conditional write from the unguarded ON CONFLICT it replaces.
describe('upsertEntityRelation skipIfDeleted guard', () => {
  it('does not resurrect an already-deleted relation', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const relationMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'remote_actor',
      objectType: 'user',
      predicate: 'follow',
    })

    await upsertEntityRelation(null, relationMetadata, { id: remoteActor.id }, [{ id: user.id }], {
      origin: 'remote',
    })
    await softDeleteEntityRelation(
      null,
      relationMetadata,
      { id: remoteActor.id },
      [{ id: user.id }],
      { origin: 'remote' },
    )

    const relations = await upsertEntityRelation(
      null,
      relationMetadata,
      { id: remoteActor.id },
      [{ id: user.id }],
      { origin: 'remote', skipIfDeleted: true },
    )
    expect(relations).toEqual([])

    const deletionState = await getEntityRelationDeletionState(
      relationMetadata,
      { id: remoteActor.id },
      { id: user.id },
    )
    expect(deletionState).toBe('deleted')
  })

  it('still inserts a relation that was never created', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const relationMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'remote_actor',
      objectType: 'user',
      predicate: 'follow',
    })

    const relations = await upsertEntityRelation(
      null,
      relationMetadata,
      { id: remoteActor.id },
      [{ id: user.id }],
      { origin: 'remote', skipIfDeleted: true },
    )
    expect(relations).toHaveLength(1)
  })
})
