import { AsyncLocalStorage } from 'node:async_hooks'
import type { PoolClient } from '@data-stores/psql'
import { ImagePlacementCapacityConflictError } from '../services/media-delivery-safety/placement-capacity-types.mts'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'
import { matchesPostgresQueryFailure } from './postgres-query-failure-match.mts'

const retryContext = new AsyncLocalStorage<{ active: boolean }>()

/** Fail the owned incoming-image claim once, including SQL scopes rebuilt from its real client. */
export async function withTestTopicImageCapacityRetry<Result>(
  imageId: string,
  operation: () => Promise<Result>,
): Promise<{ result: Result; failures: number }> {
  return runPoolObservationExclusively(async () => {
    const context = { active: true }
    let failures = 0
    const restorations = new Map<PoolClient, () => void>()
    const restoreTransactions = interceptPostgresTransactionsForTest(transaction => {
      if (!context.active || retryContext.getStore() !== context) return transaction
      const client = transaction.client
      if (restorations.has(client)) return transaction
      const queryDescriptor = Object.getOwnPropertyDescriptor(client, 'query')
      const releaseDescriptor = Object.getOwnPropertyDescriptor(client, 'release')
      const originalQuery = client.query
      const originalRelease = client.release
      const restore = () => {
        restoreProperty(client, 'query', queryDescriptor)
        restoreProperty(client, 'release', releaseDescriptor)
        restorations.delete(client)
      }
      restorations.set(client, restore)
      const query = ((...args: unknown[]) => {
        if (
          context.active &&
          retryContext.getStore() === context &&
          failures === 0 &&
          args.length === 1 &&
          matchesPostgresQueryFailure(args[0], '/* claimImagePlacementReservations */', {
            matchesValues: values => Array.isArray(values[1]) && values[1].includes(imageId),
          })
        ) {
          failures++
          return Promise.reject(new ImagePlacementCapacityConflictError())
        }
        return Reflect.apply(originalQuery, client, args)
      }) as unknown as PoolClient['query']
      Object.defineProperty(client, 'query', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: query,
      })
      Object.defineProperty(client, 'release', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: (...args: unknown[]) => {
          restore()
          return Reflect.apply(originalRelease, client, args)
        },
      })
      return transaction
    })
    try {
      const result = await retryContext.run(context, operation)
      if (failures !== 1)
        throw new Error('The owned topic update did not execute its failed capacity claim')
      return { result, failures }
    } finally {
      context.active = false
      restoreTransactions()
      for (const restore of restorations.values()) restore()
    }
  })
}

function restoreProperty(
  client: PoolClient,
  key: 'query' | 'release',
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) Object.defineProperty(client, key, descriptor)
  else Reflect.deleteProperty(client, key)
}
