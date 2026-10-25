import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createOriginGuardedListener } from '../../api/app-origin-guard.mts'
import { getTrustedClientJa4 } from './cloudflare-signals.mts'

describe('trusted Cloudflare client metadata', () => {
  it.each([undefined, 'worker-secret'])(
    'ignores caller JA4 without successful origin authentication (%s)',
    async configured => {
      const req = {
        method: 'GET',
        url: '/',
        headers: { 'x-voucha-client-ja4': 'forged', 'x-cf-worker-secret': 'wrong' },
      } as unknown as IncomingMessage
      let observed: string | undefined
      const listener = createOriginGuardedListener(request => {
        observed = getTrustedClientJa4(request)
      }, configured)
      await listener(req, { writeHead() {}, end() {} } as unknown as ServerResponse)
      expect(observed).toBeUndefined()
      expect(getTrustedClientJa4(req)).toBeUndefined()
    },
  )

  it.each([undefined, 'cloudflare-ja4'])(
    'accepts optional JA4 only after the real origin guard (%s)',
    async ja4 => {
      const req = {
        method: 'GET',
        url: '/',
        headers: {
          'x-cf-worker-secret': 'worker-secret',
          ...(ja4 && { 'x-voucha-client-ja4': ja4 }),
        },
      } as unknown as IncomingMessage
      let observed: string | undefined
      await createOriginGuardedListener(request => {
        observed = getTrustedClientJa4(request)
      }, 'worker-secret')(req, {} as ServerResponse)
      expect(observed).toBe(ja4)
    },
  )
})
