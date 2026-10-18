import { describe, expect, it } from 'vitest'
import { buildWorkerOriginRequest } from '../origin-request.mts'
import {
  INTERNAL_CANARY_FAULT_HEADER,
  STAGING_AUTHORIZATION_HEADER,
  STAGING_CANARY_FAULT_HEADER,
  STAGING_CANARY_SECRET_HEADER,
} from '../staging-control-headers.mts'
import { CACHE_PURGE_SECRET_HEADER } from '@ts-shared/cache/purge'
import type { Env } from '../types.mts'

describe('staging control header stripping', () => {
  it('removes every external and internal staging control header before origin', () => {
    const originRequest = buildWorkerOriginRequest({
      canonicalSitemapUrl: null,
      cspNonce: '',
      edgeSession: { kind: 'anon-passthrough' },
      env: { CF_WORKER_SECRET: 'worker-secret' } as Env,
      origin: 'https://backend.example.com',
      request: new Request('https://voucha.ai/api/v1/posts', {
        headers: {
          authorization: 'Bearer preserved',
          [CACHE_PURGE_SECRET_HEADER]: 'purge-secret',
          [INTERNAL_CANARY_FAULT_HEADER]: 'sie',
          [STAGING_AUTHORIZATION_HEADER]: 'Basic hidden',
          [STAGING_CANARY_FAULT_HEADER]: 'sie',
          [STAGING_CANARY_SECRET_HEADER]: 'canary-secret',
        },
      }),
      requestId: 'request-id',
      target: 'backend',
      webCsp: '',
      stripCookieNames: new Set(),
      stripAllCookies: false,
    })

    expect(originRequest.headers.get('authorization')).toBe('Bearer preserved')
    for (const header of [
      CACHE_PURGE_SECRET_HEADER,
      INTERNAL_CANARY_FAULT_HEADER,
      STAGING_AUTHORIZATION_HEADER,
      STAGING_CANARY_FAULT_HEADER,
      STAGING_CANARY_SECRET_HEADER,
    ]) {
      expect(originRequest.headers.get(header)).toBeNull()
    }
  })
})
