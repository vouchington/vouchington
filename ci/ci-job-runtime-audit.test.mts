import { describe, expect, it } from 'vitest'

import { vouchingtonRuntimeAuditOptions } from './ci-job-runtime-audit.mts'

describe('CI job runtime audit wrapper', () => {
  it('keeps only area pull_request filters', () => {
    expect(vouchingtonRuntimeAuditOptions).toEqual({
      branch: 'main',
      workflows: [
        { name: 'Static', event: 'pull_request' },
        { name: 'Backend', event: 'pull_request' },
        { name: 'Web', event: 'pull_request' },
        { name: 'Cloudflare Worker', event: 'pull_request' },
        { name: 'Lambdas', event: 'pull_request' },
        { name: 'Tooling', event: 'pull_request' },
      ],
      medianThresholdSeconds: 480,
    })
  })
})
