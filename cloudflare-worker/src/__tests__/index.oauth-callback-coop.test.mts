import { describe, expect, it } from 'vitest'

import worker from '../index.mts'
import { createContext } from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

describe('OAuth callback COOP', () => {
  it('uses unsafe-none only for callback documents', async () => {
    const env = { WEB_ORIGIN: 'https://web.example.com' } as Env
    const context = createContext(env)

    const callback = await worker.fetch(
      new Request('https://voucha.ai/auth/callback/github'),
      env,
      context,
    )
    const ordinary = await worker.fetch(new Request('https://voucha.ai/about'), env, context)

    expect(callback.headers.get('cross-origin-opener-policy')).toBe('unsafe-none')
    expect(ordinary.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups')
  })
})
