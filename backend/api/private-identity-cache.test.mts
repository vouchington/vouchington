import { describe, expect, it, onTestFinished } from 'vitest'
import { createRequest } from '../test-helpers/api/server.mts'
import { createTestUserDirect } from '../test-helpers/entities/users-direct.mts'
import { withPrivateIdentityCacheFill } from '../test-helpers/private-identity-cache.mts'
import { caches } from '../services/entity-cache/caches.mts'

describe('owned private identity cache fill', () => {
  it('joins the real cache write after the identity GET has already returned', async () => {
    const user = await createTestUserDirect()
    const request = createRequest()
    await request.authenticateAs(user)
    const cache = caches.users_private
    const writeStarted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const readFinished = Promise.withResolvers<void>()
    let operation: Promise<unknown> | undefined
    onTestFinished(async () => {
      release.resolve()
      const results = await Promise.allSettled([operation])
      const errors = results.flatMap(result =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      if (errors.length)
        throw new AggregateError(errors, 'Owned cache regression cleanup failed', {
          cause: errors[0],
        })
    })
    let writes = 0
    let returned = false
    operation = withPrivateIdentityCacheFill(
      user.id,
      async () => {
        const before = await request.get('/api/v1/my/identity').expect(200)
        readFinished.resolve()
        return before
      },
      {
        beforeWrite: () => {
          writes++
          writeStarted.resolve()
          return release.promise
        },
        release: () => release.resolve(),
      },
    ).then(before => {
      returned = true
      return before
    })
    void operation.catch(() => {})
    const requirePending = (phase: string) =>
      operation!.then(
        () => {
          throw new Error(`Cache operation finished before ${phase}`)
        },
        err => {
          throw err
        },
      )
    await Promise.race([writeStarted.promise, requirePending('owned write admission')])
    await Promise.race([readFinished.promise, requirePending('identity response')])
    expect(await cache.get(user.id)).toBeNull()
    expect(returned).toBe(false)
    release.resolve()
    await operation
    expect(returned).toBe(true)
    expect(await cache.get(user.id)).toMatchObject({ bluesky_account: null })
    expect(writes).toBe(1)
  })
})
