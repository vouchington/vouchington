import { AsyncLocalStorage } from 'node:async_hooks'
import { writePool, type PoolClient } from '@data-stores/psql'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'
import { createTestPostgresClientLoan, discardTestPostgresClient } from './postgres-client-loan.mts'
import type { TestHeldPostgresLock } from './postgres-client-lock-identity.mts'

type Loan = ReturnType<typeof createTestPostgresClientLoan>

/** Capture every explicit Promise lease in one action while callback-backed pool queries pass through. */
export function installTestOwnedPostgresPoolProxy(input: {
  pool: typeof writePool
  actionScope: AsyncLocalStorage<object>
  token: object
  requestId?: string
  requireOpen: () => void
  isClosed: () => boolean
  closedReason: Error
  targetLock: TestHeldPostgresLock
  operationRegistered: Promise<{ outcome: Promise<PromiseSettledResult<unknown>[]> }>
  captured: ReturnType<typeof Promise.withResolvers<Loan>>
  pendingConnects: Promise<PoolClient>[]
  loans: Loan[]
}): () => void {
  const { pool } = input
  const descriptor = Object.getOwnPropertyDescriptor(pool, 'connect')
  const original = pool.connect
  Object.defineProperty(pool, 'connect', {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    writable: true,
    value: new Proxy(original, {
      apply(target, receiver, args) {
        const owned =
          input.actionScope.getStore() === input.token ||
          (input.requestId !== undefined &&
            getOptionalRequestClientInfo()?.requestId === input.requestId)
        if (!owned || args.some(arg => typeof arg === 'function'))
          return Reflect.apply(target, receiver, args)
        input.requireOpen()
        const pendingConnect = (Reflect.apply(target, receiver, args) as Promise<PoolClient>).then(
          async client => {
            if (input.isClosed()) {
              await discardTestPostgresClient(client)
              throw input.closedReason
            }
            const loan = createTestPostgresClientLoan(client, input.targetLock)
            input.loans.push(loan)
            await loan.ready
            input.requireOpen()
            void input.operationRegistered
              .then(({ outcome }) => loan.wait(outcome))
              .then(() => input.captured.resolve(loan))
              .catch(input.captured.reject)
            return client
          },
        )
        input.pendingConnects.push(pendingConnect)
        void pendingConnect.catch(input.captured.reject)
        return pendingConnect
      },
    }),
  })
  return () => {
    if (descriptor) Object.defineProperty(pool, 'connect', descriptor)
    else Reflect.deleteProperty(pool, 'connect')
  }
}
