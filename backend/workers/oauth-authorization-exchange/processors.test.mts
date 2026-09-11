import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import type { Job } from 'glide-mq'
import { oauthAuthorizationExchangeQueue } from '@queues/oauth-authorization-exchange/queues'
import {
  deleteTestOAuthAuthorizationFixtures,
  insertTestOAuthAuthorization,
} from '../../test-helpers/entities/oauth-authorizations.mts'
import { processDispatchOAuthAuthorizationExchanges } from './processors.mts'
import { processOAuthAuthorizationExchangeJob } from './processors/process-job.mts'

describe('OAuth authorization exchange worker processors', () => {
  it('dispatches recoverable durable authorizations through bulk enqueue', async () => {
    const authorizationId = await insertTestOAuthAuthorization({
      status: 'callback_received',
      callbackCodeCiphertext: 'test-code-ciphertext',
      callbackReceivedAt: new Date(),
    })
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [authorizationId] })
    })

    const result = await processDispatchOAuthAuthorizationExchanges()

    expect(result.enqueued).toBeGreaterThanOrEqual(1)
    expect(await oauthAuthorizationExchangeQueue.getJob(authorizationId)).toMatchObject({
      data: { authorizationId },
    })
  })

  it('routes exchange jobs and rejects unknown job names', async () => {
    const authorizationId = randomUUID()
    await expect(
      processOAuthAuthorizationExchangeJob(job('exchangeOAuthAuthorization', { authorizationId })),
    ).resolves.toBeUndefined()
    await expect(
      processOAuthAuthorizationExchangeJob(job('dispatchOAuthAuthorizationExchanges', {})),
    ).resolves.toBeUndefined()
    await expect(processOAuthAuthorizationExchangeJob(job('unknownOAuthJob', {}))).rejects.toThrow(
      'Unknown job name: unknownOAuthJob',
    )
  })
})

function job(name: string, data: Record<string, unknown>): Job {
  return { name, data } as unknown as Job
}
