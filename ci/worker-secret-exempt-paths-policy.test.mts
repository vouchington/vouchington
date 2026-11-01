import { describe, expect, it } from 'vitest'

import { workerSecretExemptPathViolations } from './worker-secret-exempt-paths-policy.mts'

// The live file is checked by ci/check-worker-secret-exempt-paths.mts in static CI.

const PINNED = "const WORKER_SECRET_EXEMPT_PATHS = new Set(['/infra/ping'])"
const EXTRA_PATH = "const WORKER_SECRET_EXEMPT_PATHS = new Set(['/infra/ping', '/hooks/extra'])"
const EXACT_LIST_ERROR =
  "backend/api/app-origin-guard.mts: worker-secret exempt paths must be exactly ['/infra/ping']; see docs/overview/architecture/event-ingress.md"

describe('worker-secret exempt paths', () => {
  it('accepts the pinned path', () => {
    expect(workerSecretExemptPathViolations(PINNED)).toEqual([])
  })

  it('rejects an extra path', () => {
    expect(workerSecretExemptPathViolations(EXTRA_PATH)).toEqual([EXACT_LIST_ERROR])
  })
})
