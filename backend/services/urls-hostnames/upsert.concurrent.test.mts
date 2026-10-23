import { describe, expect, it } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import { beginTransaction } from '@voucha/test-helpers'
import { lockHostnameOwnership } from './ownership-lock.mts'
import { prepareUrlHostnamesForOwnedMutation, upsertUrlHostnames } from './upsert.mts'

describe('concurrent cold hostname resolution', () => {
  it('does not hold the conflict row while waiting for its ownership lock', async () => {
    const hostname = `cold-lock-${crypto.randomUUID()}.example.com`
    await using contender = await beginTransaction()
    const firstRead = Promise.withResolvers<void>()
    const releaseFirstRead = Promise.withResolvers<void>()
    const pausedQuery = Object.assign(
      async (input: Parameters<TransactionQuery>[0], values?: Parameters<TransactionQuery>[1]) => {
        const result = await contender(input, values)
        const statement = typeof input === 'string' ? input : input.text
        if (
          statement.includes('/* upsertUrlHostnames */') &&
          statement.includes('SELECT id, hostname')
        ) {
          firstRead.resolve()
          await releaseFirstRead.promise
        }
        return result
      },
      { client: contender.client },
    ) as TransactionQuery
    const preparing = prepareUrlHostnamesForOwnedMutation(null, [hostname], pausedQuery)
    void preparing.catch(() => {})

    try {
      await firstRead.promise
      const hostnameId = (await upsertUrlHostnames(null, [hostname], {}, 'private_email')).get(
        hostname,
      )!
      await using owner = await beginTransaction()
      await lockHostnameOwnership(owner, [hostnameId])
      releaseFirstRead.resolve()
      expect((await preparing).get(hostname)).toBe(hostnameId)

      // Before the fix, the stale insert's conflict UPDATE holds this row while
      // the contender waits for owner's advisory lock, forming a database deadlock.
      const promoting = upsertUrlHostnames(null, [hostname], { query: owner })
      void promoting.catch(() => {})
      const takingOwnership = lockHostnameOwnership(contender, [hostnameId])
      void takingOwnership.catch(() => {})
      expect((await promoting).get(hostname)).toBe(hostnameId)
      await owner.commit()
      await takingOwnership
    } finally {
      releaseFirstRead.resolve()
    }
  })
})
