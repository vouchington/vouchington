import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getActorUri, getPostUri } from '@modules/activitypub-uris'
import { beginTransaction } from '@voucha/test-helpers'
import { createRemoteActorFixture } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import {
  createUndoActorTargetForTest,
  deleteUndoActorRaceFactsForTest,
  hasActiveUndoActorEdgeForTest,
  observeUndoActorUriLockForTest,
  readUndoActorIdentityFactsForTest,
} from '@voucha/test-helpers/activitypub-undo-actor-identities'
import { dispatchInboundActivity } from './dispatch-activity.mts'

describe('concurrent original ActivityPub identity ownership', () => {
  it.each(['Follow', 'Like'] as const)(
    'keeps one confirmed %s owner when another actor observes the same URI concurrently',
    async type => {
      const actor = await createRemoteActorFixture()
      const otherActor = await createRemoteActorFixture()
      const getUri = type === 'Follow' ? getActorUri : getPostUri
      const target = await createUndoActorTargetForTest(type, getUri)
      const otherTarget = await createUndoActorTargetForTest(type, getUri)
      const id = `https://remote.example/activities/${randomUUID()}`
      const owners = [
        { actorId: actor.id, targetId: target.id },
        { actorId: otherActor.id, targetId: otherTarget.id },
      ]
      try {
        {
          await using winner = await beginTransaction()
          await using contender = await beginTransaction()
          let winnerEnded = false
          let contenderOutcome: Promise<PromiseSettledResult<unknown>> | undefined
          try {
            await dispatchInboundActivity(
              actor,
              { id, type, actor: actor.actor_uri, object: target.uri },
              { query: winner },
            )
            const attempted = Promise.withResolvers<void>()
            const competing = dispatchInboundActivity(
              otherActor,
              { id, type, actor: otherActor.actor_uri, object: otherTarget.uri },
              {
                query: observeUndoActorUriLockForTest(contender, type, id, attempted.resolve),
              },
            )
            contenderOutcome = Promise.allSettled([competing]).then(results => results[0]!)
            await Promise.race([
              attempted.promise,
              contenderOutcome.then(() => {
                throw new Error('Contending original finished before its identity fence')
              }),
            ])
            await winner.commit()
            winnerEnded = true
            const outcome = await contenderOutcome
            const expected =
              type === 'Follow'
                ? {
                    status: 'rejected',
                    reason: { message: 'ActivityPub Follow id belongs to another actor or target' },
                  }
                : { status: 'fulfilled', value: undefined }
            expect(outcome).toMatchObject(expected)
            if (type === 'Follow') {
              await contender.rollback()
            } else {
              await contender.commit()
            }
          } finally {
            // Release the winner before settling a blocked contender on any assertion failure.
            if (!winnerEnded) await winner.rollback()
            if (contenderOutcome) await contenderOutcome
          }
        }
        await withPostgresTransactionForTest(async query => {
          const rows = await readUndoActorIdentityFactsForTest(
            query,
            type,
            id,
            owners.map(owner => owner.actorId),
          )
          expect(rows.filter(row => row.confirmedAt !== null)).toEqual([
            expect.objectContaining({ actorId: actor.id, targetId: target.id, terminalAt: null }),
          ])
          expect(await hasActiveUndoActorEdgeForTest(query, type, actor.id, target.id)).toBe(true)
          expect(
            await hasActiveUndoActorEdgeForTest(query, type, otherActor.id, otherTarget.id),
          ).toBe(false)
        })
      } finally {
        // Both writer resources and the assertion snapshot close before committed exact cleanup.
        await deleteUndoActorRaceFactsForTest(type, id, owners)
      }
    },
  )
})
