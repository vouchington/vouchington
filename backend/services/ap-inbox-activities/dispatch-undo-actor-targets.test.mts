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

describe('actor-bound unseen Undo target binding', () => {
  it.each(['Follow', 'Like'] as const)(
    'keeps an actor-bound unseen %s fixed to its original target',
    async type => {
      const actor = await createRemoteActorFixture()
      const ownedActorIds = [actor.id]
      const target = await createUndoActorTargetForTest(
        type,
        type === 'Follow' ? getActorUri : getPostUri,
      )
      const otherTarget = await createUndoActorTargetForTest(
        type,
        type === 'Follow' ? getActorUri : getPostUri,
      )
      const id = activityUri()
      await withPostgresTransactionForTest(async query => {
        await dispatchInboundActivity(
          actor,
          {
            id: activityUri(),
            type: 'Undo',
            actor: actor.actor_uri,
            object: { id, type, object: target.uri },
          },
          { query },
        )
        const [before] = await readUndoActorIdentityFactsForTest(query, type, id, ownedActorIds)
        const retarget = dispatchInboundActivity(
          actor,
          {
            id,
            type,
            actor: actor.actor_uri,
            object: otherTarget.uri,
          },
          { query },
        )
        const [outcome] = await Promise.allSettled([retarget])
        const expected =
          type === 'Follow'
            ? {
                status: 'rejected',
                reason: { message: 'ActivityPub Follow id belongs to another actor or target' },
              }
            : { status: 'fulfilled', value: undefined }
        expect(outcome).toMatchObject(expected)
        expect(await readUndoActorIdentityFactsForTest(query, type, id, ownedActorIds)).toEqual([
          before,
        ])
        expect(await hasActiveUndoActorEdgeForTest(query, type, actor.id, otherTarget.id)).toBe(
          false,
        )
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
        const [confirmed] = await readUndoActorIdentityFactsForTest(query, type, id, ownedActorIds)
        expect(confirmed).toMatchObject({
          id: before!.id,
          targetId: target.id,
          terminalAt: before!.terminalAt,
        })
        expect(confirmed!.confirmedAt).not.toBeNull()
        expect(await hasActiveUndoActorEdgeForTest(query, type, actor.id, target.id)).toBe(false)
      })
    },
  )
})
