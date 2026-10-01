import undici from 'undici'
import { describe, expect, it } from 'vitest'
import {
  createMockAgentFetchForTest,
  MockAgent,
  withMockAgentDefaultFetchForTest,
} from './provider-http.mts'

describe('owned external provider HTTP dispatcher', () => {
  it('executes actual HTTP response parsing through the supplied dispatcher', async () => {
    const agent = new MockAgent()
    agent.disableNetConnect()
    try {
      agent
        .get('https://provider.example.com')
        .intercept({ path: '/lookup' })
        .reply(404, { missing: true })
      const response = await createMockAgentFetchForTest(agent)(
        'https://provider.example.com/lookup',
      )
      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({ missing: true })
      agent.assertNoPendingInterceptors()
    } finally {
      await agent.close()
    }
  })

  it('restores the SDK method when provider processing throws', async () => {
    const agent = new MockAgent()
    agent.disableNetConnect()
    const original = undici.fetch
    const dispatcher = agent
    const failure = new Error('processing failed after the actual HTTP response')
    try {
      agent
        .get('https://provider.example.com')
        .intercept({ path: '/redirect' })
        .reply(302, '', { headers: { location: '/target' } })
      await expect(
        withMockAgentDefaultFetchForTest(agent, async () => {
          const response = await undici.fetch('https://provider.example.com/redirect', {
            redirect: 'manual',
            dispatcher,
          })
          expect(response.status).toBe(302)
          expect(response.headers.get('location')).toBe('/target')
          throw failure
        }),
      ).rejects.toBe(failure)
      expect(undici.fetch).toBe(original)
      agent.assertNoPendingInterceptors()
    } finally {
      await agent.close()
    }
  })
})
