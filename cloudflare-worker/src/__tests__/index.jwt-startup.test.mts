import { describe, expect, it, vi } from 'vitest'
import { createWorker } from '../index.mts'
import type { fetchInner as FetchInner } from '../request-handler.mts'
import { createContext } from '../../test-helpers/src/mock-env.mts'

describe('Worker session configuration boundary', () => {
  it('does not dispatch staging requests when configured session keys are absent', async () => {
    const fetchInner = vi.fn<typeof FetchInner>().mockResolvedValue(new Response('origin'))
    const captureException = vi.fn<VitestLooseMock>()
    const worker = createWorker({ fetchInner, captureException })
    const env = {
      ENVIRONMENT: 'staging',
      PRODUCTION: 'false',
      VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: '',
      VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '',
    }
    const response = await worker.fetch(new Request('https://voucha.ai/'), env, createContext(env))
    expect(response.status).toBe(500)
    expect(fetchInner).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain('VOUCHA_SESSION_JWT')
  })
})
