import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRemoteActorFixture } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import {
  createUndoActorTargetForTest,
  hasActiveUndoActorEdgeForTest,
  readUndoActorIdentityFactsForTest,
} from '@voucha/test-helpers/activitypub-undo-actor-identities'
import { getActorUri, getPostUri } from '@modules/activitypub-uris'
import { dispatchInboundActivity } from './dispatch-activity.mts'

const activityUri = () => `https://remote.example/activities/${randomUUID()}`

describe('actor-bound unseen ActivityPub Undo identities', () => {
  it.each(['Follow', 'Like'] as const)(
    'does not let a same-host actor suppress another actor original %s',
    async type => {
      const actor = await createRemoteActorFixture()
      const otherActor = await createRemoteActorFixture()
      const ownedActorIds = [actor.id, otherActor.id]
      const target = await createUndoActorTargetForTest(
        type,
        type === 'Follow' ? getActorUri : getPostUri,
      )
      const id = activityUri()
      await withPostgresTransactionForTest(async query => {
        await dispatchInboundActivity(
          otherActor,
          {
            id: activityUri(),
            type: 'Undo',
            actor: otherActor.actor_uri,
            object: { id, type, object: target.uri },
          },
          { query },
        )
        const [unseen] = await readUndoActorIdentityFactsForTest(query, type, id, ownedActorIds)
        expect(unseen).toMatchObject({
          actorId: otherActor.id,
          confirmedAt: null,
          targetId: target.id,
        })
        expect(unseen!.terminalAt).not.toBeNull()
        await dispatchInboundActivity(
          actor,
          {
            id,
            type,
            actor: actor.actor_uri,
            object: target.uri,
          },
          { query },
        )
        const rows = await readUndoActorIdentityFactsForTest(query, type, id, ownedActorIds)
        expect(rows).toHaveLength(2)
        expect(rows.find(row => row.actorId === otherActor.id)).toEqual(unseen)
        const confirmed = rows.find(row => row.actorId === actor.id)
        expect(confirmed).toMatchObject({
          actorId: actor.id,
          targetId: target.id,
          terminalAt: null,
        })
        expect(confirmed!.confirmedAt).not.toBeNull()
        expect(await hasActiveUndoActorEdgeForTest(query, type, actor.id, target.id)).toBe(true)
        expect(await hasActiveUndoActorEdgeForTest(query, type, otherActor.id, target.id)).toBe(
          false,
        )
      })
    },
  )

  it.each(['Follow', 'Like'] as const)(
    'confirms matching Undo-before-%s without reviving its terminal state',
    async type => {
      const actor = await createRemoteActorFixture()
      const ownedActorIds = [actor.id]
      const target = await createUndoActorTargetForTest(
        type,
        type === 'Follow' ? getActorUri : getPostUri,
      )
      const original = { id: activityUri(), type, actor: actor.actor_uri, object: target.uri }
      await withPostgresTransactionForTest(async query => {
        await dispatchInboundActivity(
          actor,
          {
            id: activityUri(),
            type: 'Undo',
            actor: actor.actor_uri,
            object: original,
          },
          { query },
        )
        const [before] = await readUndoActorIdentityFactsForTest(
          query,
          type,
          original.id,
          ownedActorIds,
        )
        expect(before).toMatchObject({ confirmedAt: null, actorId: actor.id, targetId: target.id })
        expect(before!.terminalAt).not.toBeNull()
        await dispatchInboundActivity(actor, original, { query })
        const [confirmed] = await readUndoActorIdentityFactsForTest(
          query,
          type,
          original.id,
          ownedActorIds,
        )
        expect(confirmed).toMatchObject({ id: before!.id, terminalAt: before!.terminalAt })
        expect(confirmed!.confirmedAt).not.toBeNull()
        expect(await hasActiveUndoActorEdgeForTest(query, type, actor.id, target.id)).toBe(false)
        await dispatchInboundActivity(actor, original, { query })
        expect(
          await readUndoActorIdentityFactsForTest(query, type, original.id, ownedActorIds),
        ).toEqual([confirmed])
      })
    },
  )

  it.each(['Follow', 'Like'] as const)(
    'preserves an already confirmed %s owner through another actor Undo and replay',
    async type => {
      const actor = await createRemoteActorFixture()
      const otherActor = await createRemoteActorFixture()
      const ownedActorIds = [actor.id, otherActor.id]
      const target = await createUndoActorTargetForTest(
        type,
        type === 'Follow' ? getActorUri : getPostUri,
      )
      const id = activityUri()
      await withPostgresTransactionForTest(async query => {
        await dispatchInboundActivity(
          actor,
          {
            id,
            type,
            actor: actor.actor_uri,
            object: target.uri,
          },
          { query },
        )
        const [owner] = await readUndoActorIdentityFactsForTest(query, type, id, ownedActorIds)
        expect(owner!.confirmedAt).not.toBeNull()
        await dispatchInboundActivity(
          otherActor,
          {
            id: activityUri(),
            type: 'Undo',
            actor: otherActor.actor_uri,
            object: { id, type, object: target.uri },
          },
          { query },
        )
        const replay = dispatchInboundActivity(
          otherActor,
          {
            id,
            type,
            actor: otherActor.actor_uri,
            object: target.uri,
          },
          { query },
        )
        const [outcome] = await Promise.allSettled([replay])
        const expected =
          type === 'Follow'
            ? {
                status: 'rejected',
                reason: { message: 'ActivityPub Follow id belongs to another actor or target' },
              }
            : { status: 'fulfilled', value: undefined }
        expect(outcome).toMatchObject(expected)
        const rows = await readUndoActorIdentityFactsForTest(query, type, id, ownedActorIds)
        expect(rows.filter(row => row.confirmedAt !== null)).toEqual([owner])
        expect(await hasActiveUndoActorEdgeForTest(query, type, actor.id, target.id)).toBe(true)
        expect(await hasActiveUndoActorEdgeForTest(query, type, otherActor.id, target.id)).toBe(
          false,
        )
      })
    },
  )
})
