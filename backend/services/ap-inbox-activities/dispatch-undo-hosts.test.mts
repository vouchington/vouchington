import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { dispatchInboundActivity } from './dispatch-activity.mts'
import {
  createFederatedUser,
  createRemoteActorFixture,
} from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { createTestPost } from '@voucha/test-helpers'
import { getActorUri, getPostUri } from '@modules/activitypub-uris'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { readTerminalActivityIdentitiesForTest } from '@voucha/test-helpers/activitypub-terminal-identities'

describe('Undo embedded activity host ownership', () => {
  it.each(['Follow', 'Like'] as const)(
    'rejects cross-host Undo(%s) before an unseen id can be squatted',
    async type => {
      const actor = await createRemoteActorFixture()
      const target =
        type === 'Follow'
          ? getActorUri((await createFederatedUser()).id)
          : getPostUri((await createTestPost()).id)
      const foreignId = `https://another-server.example/activities/${randomUUID()}`
      await expect(
        dispatchInboundActivity(actor, {
          id: `https://remote.example/undo/${randomUUID()}`,
          type: 'Undo',
          actor: actor.actor_uri,
          object: { id: foreignId, type, object: target },
        }),
      ).rejects.toMatchObject({ statusCode: 400 })
      await withPostgresTransactionForTest(async query => {
        expect(
          await readTerminalActivityIdentitiesForTest(
            query,
            type === 'Follow' ? 'follow' : 'like',
            [foreignId],
          ),
        ).toEqual([])
      })
      const ownedId = `https://remote.example/activities/${randomUUID()}`
      await dispatchInboundActivity(actor, {
        id: `https://remote.example/undo/${randomUUID()}`,
        type: 'Undo',
        actor: actor.actor_uri,
        object: { id: ownedId, type, object: target },
      })
      await withPostgresTransactionForTest(async query => {
        const rows = await readTerminalActivityIdentitiesForTest(
          query,
          type === 'Follow' ? 'follow' : 'like',
          [ownedId],
        )
        expect(rows).toHaveLength(1)
        expect(rows[0]!.terminalAt).toBeInstanceOf(Date)
      })
    },
  )
})
