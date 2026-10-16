import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB,
  OAUTH_AUTHORIZATION_EXCHANGE_JOB,
} from '@queues/background/enqueues/oauth-authorization-exchange-jobs'
import { oauthAuthorizationExchangeHandlers } from './workers.mts'

describe('oauth authorization exchange workers', () => {
  it('serves the exchange and dispatch jobs', () => {
    expect(oauthAuthorizationExchangeHandlers.map(handler => handler.job)).toEqual([
      OAUTH_AUTHORIZATION_EXCHANGE_JOB,
      OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB,
    ])
  })

  it('runs the exchange job for an authorization that no longer exists', async () => {
    const handler = oauthAuthorizationExchangeHandlers.find(
      candidate => candidate.job === OAUTH_AUTHORIZATION_EXCHANGE_JOB,
    )
    const queued = {
      name: OAUTH_AUTHORIZATION_EXCHANGE_JOB.name,
      data: { authorizationId: randomUUID() },
    } as unknown as Job
    await expect(handler!.handle(queued)).resolves.toBeUndefined()
  })
})
