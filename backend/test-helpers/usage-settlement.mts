import { onTestFinished, vi } from 'vitest'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import app, { createApiRequestGuardedListener } from '../api/app.mts'
import type { PrivateUser } from '../services/users/types.mts'
import { withOwnedApiServer } from './api-query-options-server.mts'
import { createRequest } from './api/server.mts'

/** Drain native response closes and their actual owned quota writes before reading analytics. */
export async function withResponseUsageSettlements<Result>(
  users: readonly PrivateUser[],
  action: (
    request: ReturnType<typeof createRequest>,
    ...others: ReturnType<typeof createRequest>[]
  ) => Promise<Result>,
  charge?: ReturnType<typeof holdOwnedResponseUsageCharge>,
): Promise<Result> {
  const closes: Promise<void>[] = []
  const operations: Promise<void>[] = []
  const original = RateLimiter.prototype.add
  if (vi.isMockFunction(original)) throw new Error('RateLimiter.add already has an observer')
  const spy = vi.spyOn(RateLimiter.prototype, 'add')
  spy.mockImplementation(function (this: RateLimiter, ids: string[]) {
    const operation = original.call(this, ids)
    if (!users.some(user => ids.includes(`rest_user:user:${user.id}`))) return operation
    const completion =
      charge && ids.includes(`rest_user:user:${charge.userId}`) ? charge.hold(operation) : operation
    operations.push(completion)
    return completion
  })
  const listener = createApiRequestGuardedListener(app.callback())
  try {
    return await withOwnedApiServer(
      (request, response) => {
        closes.push(new Promise<void>(resolve => response.once('close', resolve)))
        void listener(request, response)
      },
      app,
      async address => {
        const requests = await Promise.all(
          (users.length ? users : [undefined]).map(async user => {
            const request = createRequest(address)
            if (user) await request.authenticateAs(user)
            return request
          }),
        )
        try {
          return await action(requests[0]!, ...requests.slice(1))
        } finally {
          charge?.release()
          // All close listeners run synchronously before this await resumes. The meter has
          // started each charge, and its earlier await reaction buffers analytics before our drain.
          await Promise.all(closes)
          await Promise.allSettled(operations)
        }
      },
    )
  } finally {
    spy.mockRestore()
  }
}

/** Hold one owner's returned charge promise after its real Valkey write has started. */
export function holdOwnedResponseUsageCharge(userId: string) {
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  onTestFinished(() => released.resolve())
  return {
    userId,
    entered: entered.promise,
    release: () => released.resolve(),
    hold(operation: Promise<void>): Promise<void> {
      entered.resolve()
      return Promise.all([operation, released.promise]).then(() => undefined)
    },
  }
}
