import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { beginTransaction, getTestPostgresBackendProcessId } from '@voucha/test-helpers'
import {
  createFederatedUser,
  createRemoteActorFixture,
} from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { readUndoActorIdentityFactsForTest } from '@voucha/test-helpers/activitypub-undo-actor-identities'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getActorUri } from '@modules/activitypub-uris'
import { dispatchInboundActivity } from './dispatch-activity.mts'
import { isCurrentRemoteFollowCycle, markRemoteFollowUndone } from './follow-cycles.mts'

const activityUri = () => `https://remote.example/activities/${randomUUID()}`

describe('remote Follow replacement concurrency', () => {
  it('keeps a replacement after the old cycle Undo commits first', async () => {
    const actor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const original = {
      id: activityUri(),
      type: 'Follow',
      actor: actor.actor_uri,
      object: getActorUri(user.id),
    }
    const replacement = { ...original, id: activityUri() }
    await dispatchInboundActivity(actor, original)
    await using holder = await beginTransaction()
    await markRemoteFollowUndone(original.id, actor, user.id, { query: holder })
    const holderProcessId = await getTestPostgresBackendProcessId(holder)
    await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'retireRemoteFollowCycle',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const next = dispatchInboundActivity(actor, replacement)
        await waitForLock(next)
        await dispatchInboundActivity(
          actor,
          {
            id: activityUri(),
            type: 'Undo',
            actor: actor.actor_uri,
            object: original,
          },
          { query: holder },
        )
        await holder.commit()
        expect(await next).toMatchObject({ type: 'send-follow-accept' })
      },
    )
    await using query = await beginTransaction()
    const old = await readUndoActorIdentityFactsForTest(query, 'Follow', original.id, [actor.id])
    const next = await readUndoActorIdentityFactsForTest(query, 'Follow', replacement.id, [
      actor.id,
    ])
    expect(old[0]!.terminalAt).not.toBeNull()
    expect(next[0]!.terminalAt).toBeNull()
    expect(await isCurrentRemoteFollowCycle(actor.id, user.id, next[0]!.id, { query })).toBe(true)
  })

  it.each(['commit', 'rollback'] as const)(
    'keeps the correct winner when an overlapping replacement ends in %s',
    async disposition => {
      const actor = await createRemoteActorFixture()
      const user = await createFederatedUser()
      const original = {
        id: activityUri(),
        type: 'Follow',
        actor: actor.actor_uri,
        object: getActorUri(user.id),
      }
      const first = { ...original, id: activityUri() }
      const second = { ...original, id: activityUri() }
      await dispatchInboundActivity(actor, original)
      await using holder = await beginTransaction()
      expect(await dispatchInboundActivity(actor, first, { query: holder })).toMatchObject({
        type: 'send-follow-accept',
      })
      const holderProcessId = await getTestPostgresBackendProcessId(holder)
      await withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: 'retireRemoteFollowCycle',
          releaseHolder: () => holder[Symbol.asyncDispose](),
        },
        async waitForLock => {
          const contender = dispatchInboundActivity(actor, second)
          await waitForLock(contender)
          if (disposition === 'commit') await holder.commit()
          else await holder.rollback()
          expect(await contender).toMatchObject({ type: 'send-follow-accept' })
        },
      )
      await using query = await beginTransaction()
      const winner = disposition === 'commit' ? first : second
      const loser = disposition === 'commit' ? second : first
      const winnerRows = await readUndoActorIdentityFactsForTest(query, 'Follow', winner.id, [
        actor.id,
      ])
      const loserRows = await readUndoActorIdentityFactsForTest(query, 'Follow', loser.id, [
        actor.id,
      ])
      expect(winnerRows[0]!.terminalAt).toBeNull()
      expect(
        await isCurrentRemoteFollowCycle(actor.id, user.id, winnerRows[0]!.id, { query }),
      ).toBe(true)
      expect(loserRows.map(row => row.terminalAt !== null)).toEqual(
        disposition === 'commit' ? [true] : [],
      )
    },
  )

  it('does not lock the old activity for a confirmed duplicate', async () => {
    const actor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const original = {
      id: activityUri(),
      type: 'Follow',
      actor: actor.actor_uri,
      object: getActorUri(user.id),
    }
    const replacement = { ...original, id: activityUri() }
    await dispatchInboundActivity(actor, original)
    await using holder = await beginTransaction()
    expect(await dispatchInboundActivity(actor, original, { query: holder })).toMatchObject({
      type: 'send-follow-accept',
    })
    expect(await dispatchInboundActivity(actor, replacement)).toMatchObject({
      type: 'send-follow-accept',
    })
    await holder.commit()
    await using query = await beginTransaction()
    const old = await readUndoActorIdentityFactsForTest(query, 'Follow', original.id, [actor.id])
    const next = await readUndoActorIdentityFactsForTest(query, 'Follow', replacement.id, [
      actor.id,
    ])
    expect(old[0]!.terminalAt).not.toBeNull()
    expect(await isCurrentRemoteFollowCycle(actor.id, user.id, next[0]!.id, { query })).toBe(true)
  })
})
